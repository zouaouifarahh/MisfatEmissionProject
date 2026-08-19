import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';

import { OrganizationService } from '../../services/organization.service';
import { Filiale, AnneeReference } from '../../models/organization.model';
import { BilanCarboneService } from '../../core/bilan-carbone.service';
import { ActivityDataService } from '../../core/activity-data.service';
import { kgVersTonnes } from '../../core/unites-carbone';
import {
  consoliderGroupe, ecartMediane,
  ConsolidationGroupe, EmpreinteFiliale, DenominateursFiliale, LigneComparative
} from '../../core/consolidation-groupe';

/**
 * Rapport Groupe : chaque filiale pour elle-même, puis toutes ensemble.
 *
 * <p>Le tableau de bord parle d'un périmètre à la fois. Cet écran fait
 * l'inverse : il charge les cinq sociétés d'un même exercice et les met côte à
 * côte, ce qu'aucune vue filtrée ne permet de faire.</p>
 *
 * <p>Les empreintes brutes ne suffisent pas à comparer : une filiale de mille
 * salariés émettra toujours davantage qu'une filiale de cent. Les intensités —
 * par salarié, par million de chiffre d'affaires, par pièce produite — sont ce
 * qui rend la comparaison honnête, et elles n'apparaissent que si leurs
 * dénominateurs ont été saisis.</p>
 */
@Component({
  selector: 'app-consolidation-groupe',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './consolidation-groupe.component.html',
  styleUrl: './consolidation-groupe.component.css'
})
export class ConsolidationGroupeComponent implements OnInit {

  private readonly organizationService = inject(OrganizationService);
  private readonly bilanService = inject(BilanCarboneService);
  private readonly activiteService = inject(ActivityDataService);
  private readonly cdr = inject(ChangeDetectorRef);

  filiales: Filiale[] = [];
  annees: AnneeReference[] = [];
  exercice: number | null = null;

  consolidation: ConsolidationGroupe | null = null;
  chargement = false;
  erreur = '';

  /** Intensité mise en avant dans le graphique comparatif. */
  intensiteAffichee: 'total' | 'effectif' | 'chiffreAffaires' | 'production' = 'total';

  readonly INTENSITES = [
    { code: 'total' as const, libelle: 'Empreinte totale', unite: 'tCO₂e' },
    { code: 'effectif' as const, libelle: 'Par salarié', unite: 'tCO₂e / salarié' },
    { code: 'chiffreAffaires' as const, libelle: "Par million de CA", unite: 'tCO₂e / M' },
    { code: 'production' as const, libelle: 'Par unité produite', unite: 'kgCO₂e / unité' }
  ];

  ngOnInit(): void {
    forkJoin({
      filiales: this.organizationService.getFiliales().pipe(catchError(() => of([] as Filiale[]))),
      annees: this.organizationService.getAnnees().pipe(catchError(() => of([] as AnneeReference[])))
    }).subscribe(({ filiales, annees }) => {
      this.filiales = filiales ?? [];
      this.annees = [...(annees ?? [])].sort((a, b) => b.valeur - a.valeur);

      // Le plus récent exercice fait office de vue par défaut : c'est celui
      // qu'un comité de direction consulte.
      this.exercice = this.annees[0]?.valeur ?? null;
      this.cdr.markForCheck();
      this.charger();
    });
  }

  /** Recharge les bilans de toutes les filiales pour l'exercice retenu. */
  charger(): void {
    if (!this.filiales.length || this.exercice === null) {
      this.consolidation = null;
      this.cdr.markForCheck();
      return;
    }

    this.chargement = true;
    this.erreur = '';
    const exercice = this.exercice;

    forkJoin(
      this.filiales.map(filiale => this.bilanService
        .charger(filiale.id, null, exercice)
        .pipe(catchError(() => of(null))))
    ).subscribe(bilans => {

      const empreintes: EmpreinteFiliale[] = bilans.map((bilan, i) => {
        const filiale = this.filiales[i];
        return {
          entityId: filiale.id,
          libelle: filiale.libelle,
          pays: filiale.pays ?? '',
          devise: filiale.devise ?? '',
          // Le bilan est tenu en kilogrammes ; l'écran, comme tout le reste de
          // la console, raisonne en tonnes.
          scope1: kgVersTonnes(bilan?.scope1Kg ?? 0),
          scope2: kgVersTonnes(bilan?.scope2Kg ?? 0),
          scope3: kgVersTonnes(bilan?.scope3Kg ?? 0),
          total: kgVersTonnes(bilan?.totalKg ?? 0),
          serveurJoignable: bilan?.serveurJoignable ?? false
        };
      });

      const denominateurs: DenominateursFiliale[] = this.filiales.map(filiale => ({
        entityId: filiale.id,
        effectif: this.activiteService.valeur(filiale.id, exercice, 'effectif'),
        chiffreAffairesM: this.activiteService.valeur(filiale.id, exercice, 'chiffreAffairesM'),
        production: this.activiteService.valeur(filiale.id, exercice, 'production')
      }));

      this.consolidation = consoliderGroupe(empreintes, denominateurs);
      this.chargement = false;
      this.cdr.markForCheck();
    });
  }

  // ---------- Lecture pour le graphique comparatif ----------

  /** Valeur retenue pour une filiale selon l'intensité affichée. */
  valeurAffichee(ligne: LigneComparative): number | null {
    switch (this.intensiteAffichee) {
      case 'effectif': return ligne.intensiteEffectif;
      case 'chiffreAffaires': return ligne.intensiteChiffreAffaires;
      case 'production': return ligne.intensiteProduction;
      default: return ligne.total;
    }
  }

  get uniteAffichee(): string {
    return this.INTENSITES.find(i => i.code === this.intensiteAffichee)?.unite ?? '';
  }

  /**
   * Barres comparatives, classées par la valeur affichée.
   *
   * <p>Les filiales dont l'intensité n'est pas calculable ne sont pas
   * reléguées à zéro : elles figurent à part, avec la mention du dénominateur
   * manquant. Les mettre à zéro les ferait passer pour exemplaires.</p>
   */
  get barres(): { libelle: string; pays: string; valeur: number | null;
                  largeur: number; ecart: number | null; manque: string }[] {

    const lignes = this.consolidation?.lignes ?? [];
    const valeurs = lignes.map(l => this.valeurAffichee(l));
    const maximum = Math.max(...valeurs.filter((v): v is number => typeof v === 'number'), 0);

    return lignes
      .map((ligne, i) => ({
        libelle: ligne.libelle,
        pays: ligne.pays || 'Non renseigné',
        valeur: valeurs[i],
        largeur: maximum > 0 && typeof valeurs[i] === 'number'
          ? (valeurs[i]! / maximum) * 100
          : 0,
        ecart: this.intensiteAffichee === 'total'
          ? null
          : ecartMediane(valeurs[i], valeurs),
        manque: ligne.denominateursManquants.join(', ')
      }))
      .sort((a, b) => (b.valeur ?? -1) - (a.valeur ?? -1));
  }

  /** Filiales dont un dénominateur reste à saisir, pour le bandeau d'appel. */
  get aCompleter(): string[] {
    return this.consolidation?.filialesIncompletes ?? [];
  }

  /**
   * Les intensités par chiffre d'affaires mêlent-elles plusieurs devises ?
   *
   * <p>MISFAT Maroc déclare en dirhams, SOLAUFIL France en euros : leurs
   * ratios par million ne sont pas directement comparables, et l'écran doit le
   * dire plutôt que de les aligner sans réserve.</p>
   */
  get devisesMelangees(): string[] {
    const devises = new Set(
      (this.consolidation?.lignes ?? [])
        .filter(l => l.intensiteChiffreAffaires !== null)
        .map(l => (l.devise || '').trim().toUpperCase())
        .filter(Boolean)
    );
    return devises.size > 1 ? [...devises].sort() : [];
  }
}
