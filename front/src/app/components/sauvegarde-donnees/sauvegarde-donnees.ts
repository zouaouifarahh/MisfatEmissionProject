import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as XLSX from 'xlsx';

import { CLES_PAR_CATEGORIE } from '../../shared/dispatch/mesures-locales';
import { ConfirmationService } from '../../shared/ui/confirmation.service';

/** Horodatage de la dernière sauvegarde produite. */
const CLE_DERNIERE = 'misfat_derniere_sauvegarde';

/** Libellé lisible de chaque catégorie, pour les onglets du classeur. */
const LIBELLES: Record<string, string> = {
  'combustion-etablissements': 'Combustion usines',
  'combustion-vehicules': 'Combustion vehicules',
  'emissions-refrigerants': 'Refrigerants',
  'electricite-achetee': 'Electricite',
  'biens-services': 'Biens et services',
  'biens-equipement': 'Biens equipement',
  'energie': 'Energie amont',
  'transport-amont': 'Transport amont',
  'dechets': 'Dechets',
  'voyages-affaires': 'Voyages',
  'deplacements-employes': 'Deplacements',
  'actifs-loues-amont': 'Actifs loues amont',
  'transport-aval': 'Transport aval',
  'transformation-produits': 'Transformation',
  'utilisation-produits': 'Utilisation',
  'fin-de-vie-produits': 'Fin de vie',
  'actifs-loues-aval': 'Actifs loues aval',
  'franchises': 'Franchises',
  'investissements': 'Investissements'
};

/**
 * Sauvegarde et restauration des saisies.
 *
 * <p>Les saisies résident dans le stockage du navigateur : un cache vidé ou un
 * changement de poste les emporte. Cet écran est le filet, en attendant leur
 * persistance en base.</p>
 */
@Component({
  selector: 'app-sauvegarde-donnees',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sauv-page">

      <div class="sauv-entete">
        <h2>Sauvegarde &amp; Données 🛟</h2>
      </div>

      <!-- NOTICE -->
      <section class="sauv-notice">
        <div class="notice-titre"><span aria-hidden="true">💡</span> À quoi sert cette interface ?</div>

        <ul class="notice-liste">
          <li>
            <strong>Sécurisation temporaire</strong> — vos données saisies sont actuellement
            stockées localement dans votre navigateur.
          </li>
          <li>
            <strong>Protection anti-perte</strong> — téléchargez régulièrement une sauvegarde
            globale en un clic (.xlsx) pour éviter toute perte en cas de nettoyage du navigateur
            ou de changement de poste.
          </li>
          <li>
            <strong>Restauration instantanée</strong> — réimportez votre fichier de sauvegarde
            pour réinjecter l'intégralité de vos 19 catégories de données sans aucun risque.
          </li>
        </ul>
      </section>

      <div class="sauv-alerte" *ngIf="alerte">
        <span aria-hidden="true">⚠️</span> {{ alerte }}
      </div>

      <div class="sauv-succes" *ngIf="succes">
        <span aria-hidden="true">✅</span> {{ succes }}
      </div>

      <!-- ACTIONS -->
      <div class="sauv-cartes">

        <section class="sauv-carte">
          <span class="carte-icone" aria-hidden="true">📥</span>
          <h3>Exporter la sauvegarde globale</h3>
          <p>
            Télécharge un fichier Excel complet (.xlsx) contenant les données de l'ensemble
            des 19 catégories.
          </p>

          <p class="carte-compte">{{ nombreLignes }} ligne(s) sur {{ nombreCategories }} catégorie(s)</p>

          <button type="button" class="btn-sauv btn-sauv-principal" (click)="exporter()">
            📥 Télécharger la sauvegarde (.xlsx)
          </button>

          <p class="carte-horodatage">
            Dernière sauvegarde :
            <strong>{{ derniereSauvegarde || 'aucune à ce jour' }}</strong>
          </p>
        </section>

        <section class="sauv-carte">
          <span class="carte-icone" aria-hidden="true">📤</span>
          <h3>Restaurer à partir d'un fichier</h3>
          <p>
            Restaure instantanément l'intégralité des saisies à partir d'un fichier de
            sauvegarde préalable.
          </p>

          <p class="carte-avertissement">
            La restauration remplace les saisies actuelles de chaque catégorie présente dans
            le fichier. Une confirmation vous sera demandée.
          </p>

          <label class="btn-sauv btn-sauv-secondaire">
            📤 Importer un fichier de sauvegarde
            <input type="file" accept=".xlsx,.xls" hidden (change)="surFichier($event)">
          </label>
        </section>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif; }

    .sauv-page { display: flex; flex-direction: column; gap: 14px; }

    .sauv-entete h2 { margin: 0; font-size: 19px; font-weight: 800; color: #1E293B; }

    .sauv-notice {
      padding: 16px 18px;
      border-radius: 13px;
      background: #EFF6FA;
      border: 1px solid #CFE4F0;
      border-left: 4px solid #1E92CD;
    }

    .notice-titre {
      font-size: 13.5px; font-weight: 800; color: #1E3A52; margin-bottom: 9px;
    }

    .notice-liste { margin: 0; padding-left: 20px; }
    .notice-liste li { font-size: 12.5px; line-height: 1.7; color: #475569; }
    .notice-liste strong { color: #1E3A52; }

    .sauv-alerte, .sauv-succes {
      display: flex; align-items: flex-start; gap: 9px;
      padding: 11px 14px; border-radius: 10px; font-size: 12.5px; font-weight: 600;
    }

    .sauv-alerte { color: #B4652F; background: #FCF4EE; border: 1px solid #F5DCC2; }
    .sauv-succes { color: #2F7D50; background: #EEF7F2; border: 1px solid #CBEBD8; }

    .sauv-cartes {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 14px;
    }

    .sauv-carte {
      display: flex; flex-direction: column; gap: 9px;
      padding: 20px 22px;
      border-radius: 15px;
      background: #ffffff;
      border: 1px solid #E2E8F0;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    .carte-icone { font-size: 26px; line-height: 1; }
    .sauv-carte h3 { margin: 0; font-size: 15px; font-weight: 800; color: #1E293B; }
    .sauv-carte p { margin: 0; font-size: 12.5px; line-height: 1.6; color: #475569; }

    .carte-compte {
      font-weight: 700 !important; color: #1E3A52 !important;
      font-variant-numeric: tabular-nums;
    }

    /* La restauration écrase : elle s'annonce avant, pas après. */
    .carte-avertissement {
      padding: 9px 12px; border-radius: 9px;
      font-size: 11.5px !important; color: #B4652F !important;
      background: #FFFBF5; border: 1px solid #F5DCC2;
    }

    .btn-sauv {
      display: inline-block; margin-top: auto;
      padding: 11px 18px; border-radius: 10px;
      font-size: 13px; font-weight: 700; font-family: inherit;
      text-align: center; cursor: pointer; border: 1px solid transparent;
    }

    .btn-sauv-principal { color: #ffffff; background: #1E92CD; border-color: #1E92CD; }
    .btn-sauv-principal:hover { filter: brightness(1.08); }

    .btn-sauv-secondaire { color: #1E3A52; background: #EFF6FA; border-color: #CFE4F0; }
    .btn-sauv-secondaire:hover { background: #E1EFF7; }

    .carte-horodatage { font-size: 11.5px !important; color: #94A3B8 !important; }
    .carte-horodatage strong { color: #475569; }
  `]
})
export class SauvegardeDonneesComponent implements OnInit {

  private readonly confirmation = inject(ConfirmationService);
  private readonly cdr = inject(ChangeDetectorRef);

  derniereSauvegarde = '';
  alerte = '';
  succes = '';

  ngOnInit(): void {
    if (typeof localStorage !== 'undefined') {
      this.derniereSauvegarde = localStorage.getItem(CLE_DERNIERE) ?? '';
    }
  }

  /** Catégories effectivement renseignées. */
  get nombreCategories(): number {
    return this.lots().filter(lot => lot.lignes.length).length;
  }

  get nombreLignes(): number {
    return this.lots().reduce((somme, lot) => somme + lot.lignes.length, 0);
  }

  /** Contenu de chaque catégorie, lu dans le stockage du navigateur. */
  private lots(): { categorie: string; cle: string; lignes: Record<string, unknown>[] }[] {
    if (typeof localStorage === 'undefined') return [];

    return Object.entries(CLES_PAR_CATEGORIE).map(([categorie, cle]) => {
      let lignes: Record<string, unknown>[] = [];
      try {
        const brut = localStorage.getItem(cle);
        const relu = brut ? JSON.parse(brut) : [];
        // Les lignes ventilées portent un identifiant négatif : elles
        // appartiennent au magasin de répartition, pas à l'écran.
        if (Array.isArray(relu)) lignes = relu.filter(l => Number(l?.id ?? 0) >= 0);
      } catch {
        lignes = [];
      }
      return { categorie, cle, lignes };
    });
  }

  /**
   * Produit le classeur de sauvegarde.
   *
   * <p>Un onglet par catégorie renseignée, plus un onglet de correspondance
   * qui porte la clé technique de chacune : c'est lui qui rend la restauration
   * possible même si les libellés changent.</p>
   */
  exporter(): void {
    this.alerte = '';
    this.succes = '';

    const lots = this.lots().filter(lot => lot.lignes.length);

    if (!lots.length) {
      this.alerte = 'Aucune saisie à sauvegarder : les 19 catégories sont vides.';
      this.cdr.detectChanges();
      return;
    }

    const classeur = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      classeur,
      XLSX.utils.json_to_sheet(lots.map(lot => ({
        Categorie: lot.categorie,
        Cle: lot.cle,
        Onglet: LIBELLES[lot.categorie] ?? lot.categorie,
        Lignes: lot.lignes.length
      }))),
      '_index'
    );

    for (const lot of lots) {
      const onglet = (LIBELLES[lot.categorie] ?? lot.categorie).slice(0, 31);
      XLSX.utils.book_append_sheet(classeur, XLSX.utils.json_to_sheet(lot.lignes), onglet);
    }

    const horodatage = new Date();
    XLSX.writeFile(classeur, `sauvegarde-misfat-${horodatage.toISOString().slice(0, 10)}.xlsx`);

    this.derniereSauvegarde = horodatage.toLocaleString('fr-FR');
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CLE_DERNIERE, this.derniereSauvegarde);
    }

    this.succes = `Sauvegarde de ${this.nombreLignes} ligne(s) sur `
      + `${lots.length} catégorie(s) téléchargée.`;
    this.cdr.detectChanges();
  }

  surFichier(evenement: Event): void {
    const input = evenement.target as HTMLInputElement;
    const fichier = input.files?.[0];
    input.value = '';
    if (fichier) this.restaurer(fichier);
  }

  /**
   * Restaure les saisies depuis un classeur de sauvegarde.
   *
   * <p>La correspondance passe par l'onglet {@code _index} : sans lui, rien
   * n'est écrit, plutôt que de deviner à quelle catégorie appartient un
   * onglet et d'écraser la mauvaise.</p>
   */
  private restaurer(fichier: File): void {
    this.alerte = '';
    this.succes = '';

    const lecteur = new FileReader();

    lecteur.onerror = () => {
      this.alerte = 'Fichier illisible. Vérifiez qu\'il n\'est pas ouvert dans Excel.';
      this.cdr.detectChanges();
    };

    lecteur.onload = async () => {
      try {
        const classeur = XLSX.read(lecteur.result, { type: 'array' });
        const feuilleIndex = classeur.Sheets['_index'];

        if (!feuilleIndex) {
          this.alerte = 'Ce classeur n\'est pas une sauvegarde MISFAT : l\'onglet « _index » '
            + 'est absent. Aucune donnée n\'a été modifiée.';
          this.cdr.detectChanges();
          return;
        }

        const index = XLSX.utils.sheet_to_json<Record<string, string>>(feuilleIndex);
        const aRestaurer = index
          .map(entree => ({
            cle: String(entree['Cle'] ?? ''),
            onglet: String(entree['Onglet'] ?? ''),
            categorie: String(entree['Categorie'] ?? '')
          }))
          .filter(e => e.cle && classeur.Sheets[e.onglet]);

        if (!aRestaurer.length) {
          this.alerte = 'Aucune catégorie exploitable dans ce fichier de sauvegarde.';
          this.cdr.detectChanges();
          return;
        }

        const confirme = await this.confirmation.demander({
          titre: 'Confirmation de restauration',
          message: `Voulez-vous restaurer ${aRestaurer.length} catégorie(s) depuis ce fichier ? `
            + 'Cette action est irréversible.',
          consequences: [
            'Les saisies actuelles de ces catégories seront remplacées.',
            'Les catégories absentes du fichier ne sont pas touchées.',
            'Pensez à exporter une sauvegarde avant, si vous avez un doute.'
          ],
          libelleAction: 'Oui, restaurer'
        });
        if (!confirme) return;

        let lignes = 0;
        for (const entree of aRestaurer) {
          const contenu = XLSX.utils.sheet_to_json(classeur.Sheets[entree.onglet]);
          localStorage.setItem(entree.cle, JSON.stringify(contenu));
          lignes += contenu.length;
        }

        this.succes = `${lignes} ligne(s) restaurée(s) sur ${aRestaurer.length} catégorie(s). `
          + 'Rechargez la page pour les voir dans les écrans de mesure.';
        this.cdr.detectChanges();
      } catch (erreur) {
        this.alerte = 'Restauration impossible : '
          + (erreur instanceof Error ? erreur.message : 'format de classeur inattendu.')
          + ' Aucune donnée n\'a été modifiée.';
        this.cdr.detectChanges();
      }
    };

    lecteur.readAsArrayBuffer(fichier);
  }
}
