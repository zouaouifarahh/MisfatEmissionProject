import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, catchError, forkJoin, of } from 'rxjs';

import { OrganizationService } from '../../services/organization.service';
import { Filiale, AnneeReference } from '../../models/organization.model';
import { BilanCarboneService } from '../../core/bilan-carbone.service';
import { ActivityDataService } from '../../core/activity-data.service';
import { EntityContextService } from '../../core/entity-context.service';
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
export class ConsolidationGroupeComponent implements OnInit, OnDestroy {

  private readonly organizationService = inject(OrganizationService);
  private readonly bilanService = inject(BilanCarboneService);
  private readonly activiteService = inject(ActivityDataService);
  private readonly entityService = inject(EntityContextService);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly abonnements = new Subscription();

  /**
   * Empreintes du dernier chargement, conservées pour recomposer sans réseau.
   *
   * <p>Enregistrer un KPI ne change aucune émission : rappeler les bilans des
   * cinq filiales pour recalculer trois divisions serait cinq appels HTTP pour
   * rien, et ferait clignoter le tableau à chaque frappe.</p>
   */
  private empreintes: EmpreinteFiliale[] = [];

  /** Dernière année reçue du filtre global, pour n'y réagir qu'au changement. */
  private anneeDuFiltre: number | null = null;

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

      // L'exercice consulté prime sur le plus récent millésime ouvert. L'écran
      // s'ouvrait auparavant sur la dernière année d'annee_reference — 2026 —
      // quel que soit le filtre : un KPI saisi sur 2025 n'apparaissait donc
      // nulle part, et l'écran passait pour figé alors qu'il montrait
      // fidèlement un exercice vide.
      this.exercice = this.entityService.filter.year ?? this.annees[0]?.valeur ?? null;
      this.anneeDuFiltre = this.entityService.filter.year;
      this.cdr.markForCheck();
      this.charger();
    });

    // Changer l'année dans le filtre global recharge les bilans et recalcule
    // les intensités de toutes les filiales.
    this.abonnements.add(this.entityService.year$.subscribe(annee => {
      if (annee === this.anneeDuFiltre) return;
      this.anneeDuFiltre = annee;

      if (annee === null || annee === this.exercice) return;
      this.exercice = annee;
      this.cdr.markForCheck();
      this.charger();
    }));

    // Un KPI enregistré ailleurs doit se voir ici sans changer d'onglet : les
    // dénominateurs sont relus et les ratios recomposés, sans rappeler les
    // bilans que rien n'a fait bouger.
    this.abonnements.add(this.activiteService.donnees$.subscribe(() => {
      if (!this.empreintes.length) return;
      this.recomposer();
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.abonnements.unsubscribe();
  }

  /** Recharge les bilans de toutes les filiales pour l'exercice retenu. */
  charger(): void {
    if (!this.filiales.length || this.exercice === null) {
      // Les empreintes sont oubliées avec la consolidation : les garder ferait
      // recomposer un tableau sur des empreintes qui ne valent plus.
      this.empreintes = [];
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

      this.empreintes = bilans.map((bilan, i) => {
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

      this.recomposer();
      this.chargement = false;
      this.cdr.markForCheck();
    });
  }

  /**
   * Recalcule les intensités sur les KPI du moment, sans toucher au réseau.
   *
   * <p>Séparé de {@link charger} parce que les deux ne dépendent pas des mêmes
   * données : les empreintes viennent du serveur et ne bougent qu'avec
   * l'exercice, les dénominateurs viennent de l'annuaire d'activité et changent
   * à chaque enregistrement de KPI.</p>
   */
  private recomposer(): void {
    const exercice = this.exercice;

    const denominateurs: DenominateursFiliale[] = this.filiales.map(filiale => ({
      entityId: filiale.id,
      effectif: this.activiteService.valeur(filiale.id, exercice, 'effectif'),
      chiffreAffairesM: this.activiteService.valeur(filiale.id, exercice, 'chiffreAffairesM'),
      production: this.activiteService.valeur(filiale.id, exercice, 'production')
    }));

    this.consolidation = consoliderGroupe(this.empreintes, denominateurs);
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
