import {
  ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, PLATFORM_ID, effect, inject, signal
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, catchError, of } from 'rxjs';

import { EntityContextService, EntityFilter } from '../../core/entity-context.service';
import { PaysOption, ReportFiltersService } from '../../core/report-filters.service';
import { ActivityDataService } from '../../core/activity-data.service';
import { BilanCarbone, BilanCarboneService, PosteBilan } from '../../core/bilan-carbone.service';
import { NOMENCLATURE_SCOPES } from '../../core/nomenclature-scopes';
import { FactorRow, ReferentialService } from '../../services/referential.service';
import {
  CHAPITRES_NORME,
  ChapitreNorme,
  ParametresNorme,
  SolutionRSE,
  STATUTS_VERIFICATION,
  parametresVides,
  textesParDefaut
} from './chapitres-norme';
import {
  LangueRapport, libelleLangue, localeDe, traduire, traduireDonnee
} from './reporting-i18n';

/**
 * Rapport carbone exécutif, configuré poste par poste.
 *
 * <p>Le document tient en trois à cinq pages : une synthèse chiffrée, une
 * lecture des principaux contributeurs, puis le détail des seules catégories
 * retenues. Ce qui figure au rapport est un choix de l'utilisateur ; le
 * panneau de configuration ne fait que le lui proposer, en cochant d'office
 * les postes qui pèsent quelque chose sur le périmètre consulté.</p>
 *
 * <p>L'export passe par l'impression du navigateur, pilotée par une feuille de
 * style dédiée : le rapport sort en PDF sans qu'aucune librairie de rendu ne
 * s'interpose entre les chiffres affichés et le document produit.</p>
 */

/** Segment du diagramme circulaire, tel que le tracé SVG l'attend. */
export interface SegmentDonut {
  libelle: string;
  couleur: string;
  valeurKg: number;
  pct: number;
  /** Longueur de l'arc, en unités de circonférence. */
  longueur: number;
  /** Décalage du début de l'arc, en unités de circonférence. */
  decalage: number;
}

/** Écart d'un poste entre l'exercice consulté et le précédent. */
export interface EcartPoste {
  libelle: string;
  deltaKg: number;
  deltaPct: number | null;
}

/** Mode de consultation du rapport. */
export type ModeRapport = 'synthese' | 'norme';

/** Clé de persistance des paramètres du rapport normé, par périmètre. */
export const CLE_RAPPORT_NORME = 'misfat_rapport_norme';

/** Ratio d'intensité, tel qu'il figure au chapitre 9. */
export interface RatioIntensite {
  libelle: string;
  valeur: number | null;
  unite: string;
  /** Ce qui manque pour que le ratio soit calculable. */
  manque: string;
}

/** Mini-carte de ratio du bandeau de synthèse. */
export interface RatioSynthese {
  id: string;
  libelle: string;
  /** `null` tant que le dénominateur n'a pas été renseigné. */
  valeur: number | null;
  /** Valeur mise en forme, ou tiret cadratin en l'absence de dénominateur. */
  affichage: string;
  unite: string;
  /** Explication portée par l'infobulle, renseignée ou non. */
  infobulle: string;
}

/** Position de l'exercice sur la trajectoire de décarbonation. */
export interface Trajectoire {
  objectifPct: number;
  anneeCible: number | null;
  anneeBase: number | null;
  baseKg: number;
  cibleKg: number;
  actuelKg: number;
  /** Écart à la cible, en kgCO₂e ; positif au-dessus de la cible. */
  ecartKg: number;
  /** Le même écart, rapporté à la cible. */
  ecartPct: number | null;
  /** Part de l'effort de réduction déjà réalisée, bornée à [0, 100]. */
  progression: number;
  atteint: boolean;
}

/**
 * Gaz à effet de serre et leur potentiel de réchauffement.
 *
 * <p>Ces PRG sont des constantes publiées par le GIEC (5ᵉ rapport, horizon
 * 100 ans) : ce sont des données de référence, non des mesures. Elles servent à
 * expliquer au lecteur comment un kilogramme de méthane devient 28 kilogrammes
 * d'équivalent CO₂ — elles ne chiffrent rien du périmètre.</p>
 */
export const GAZ_REFERENCE: {
  formule: string; nom: string; prg100: number; sources: string;
}[] = [
  { formule: 'CO₂', nom: 'Dioxyde de carbone', prg100: 1,
    sources: 'Combustion des carburants et du gaz naturel, électricité de réseau' },
  { formule: 'CH₄', nom: 'Méthane', prg100: 28,
    sources: 'Combustion incomplète, fuites amont de gaz, mise en décharge' },
  { formule: 'N₂O', nom: 'Protoxyde d\'azote', prg100: 265,
    sources: 'Combustion, traitement des effluents' },
  { formule: 'HFC-134a', nom: 'Hydrofluorocarbure 134a', prg100: 1_300,
    sources: 'Climatisation des véhicules et des bâtiments' },
  { formule: 'HFC-125', nom: 'Hydrofluorocarbure 125', prg100: 3_170,
    sources: 'Constituant des mélanges frigorigènes' },
  { formule: 'R-410A', nom: 'Mélange R-410A', prg100: 1_924,
    sources: 'Groupes froids, climatisation industrielle' },
  { formule: 'R-404A', nom: 'Mélange R-404A', prg100: 3_943,
    sources: 'Froid industriel' },
  { formule: 'SF₆', nom: 'Hexafluorure de soufre', prg100: 23_500,
    sources: 'Appareillage électrique haute tension' }
];

/** Rapprochement avec l'exercice précédent, quand il est calculable. */
export interface Comparaison {
  annee: number;
  totalKg: number;
  deltaKg: number;
  deltaPct: number | null;
  hausses: EcartPoste[];
  baisses: EcartPoste[];
}

@Component({
  selector: 'app-reporting',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reporting.component.html',
  styleUrl: './reporting.component.css'
})
export class ReportingComponent implements OnInit, OnDestroy {
  private readonly entityService = inject(EntityContextService);

  /** Filtres du rapport : pays d'implantation et exercice, tenus en signals. */
  readonly filtres = inject(ReportFiltersService);

  private readonly bilanService = inject(BilanCarboneService);
  private readonly activiteService = inject(ActivityDataService);
  private readonly referentialService = inject(ReferentialService);
  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * Données d'activité du périmètre consulté.
   *
   * <p>Elles ne sont pas saisies ici : l'écran « Données d'Activité & KPI » en
   * est la source unique. Les tenir en double dans le rapport ferait diverger
   * les deux copies au premier oubli, et un ratio du rapport contredirait
   * l'intensité du tableau de bord.</p>
   */
  private get activite() {
    const entityId = this.bilan?.entityId ?? null;
    const annee = this.bilan?.annee ?? null;

    return {
      chiffreAffairesM: this.activiteService.valeur(entityId, annee, 'chiffreAffairesM'),
      production: this.activiteService.valeur(entityId, annee, 'production'),
      effectif: this.activiteService.valeur(entityId, annee, 'effectif')
    };
  }

  /** Rayon du cercle du donut ; la circonférence en découle. */
  readonly rayonDonut = 54;
  readonly circonference = 2 * Math.PI * 54;

  readonly nomenclature = NOMENCLATURE_SCOPES;

  bilan: BilanCarbone | null = null;
  comparaison: Comparaison | null = null;
  chargement = true;

  /** Identifiants des postes retenus au rapport. */
  private retenus = new Set<string>();

  /** Auteur du document, repris de la session puis modifiable. */
  auteur = 'Direction QHSE — Groupe MISFAT';

  /** Date d'impression, figée au chargement du rapport. */
  dateImpression = new Date();

  /** Sous-titre libre, imprimé sous le titre du rapport. */
  sousTitre = 'Synthèse GHG Protocol — Scopes 1, 2 et 3';

  /** Le panneau de configuration est-il déployé ? */
  configurationOuverte = true;

  // ---------- MODE 2 : RAPPORT NORMÉ ----------

  /** Onglet actif ; le bouton d'impression suit ce choix. */
  mode: ModeRapport = 'synthese';

  readonly chapitres = CHAPITRES_NORME;
  readonly statutsVerification = STATUTS_VERIFICATION;

  /** Chapitres dépliés ; le premier l'est d'office pour amorcer la lecture. */
  private deplies = new Set<string>(['couverture']);

  /** Paramètres qualitatifs du périmètre courant. */
  parametres: ParametresNorme = parametresVides();

  /** Bloc en cours d'édition, et son brouillon. */
  blocEnEdition: string | null = null;
  brouillon = '';

  /** Bilan de l'année de référence, chargé quand elle est renseignée. */
  bilanReference: BilanCarbone | null = null;

  private readonly abonnements = new Subscription();

  /** Périmètre déjà chargé ; évite de rejouer la même requête. */
  private clefChargement: string | null = null;

  // ---------- LANGUE DU RAPPORT ----------

  /**
   * Langue du document, en signal.
   *
   * <p>Le rapport est remis en comité comme à un vérificateur externe : il doit
   * pouvoir sortir dans les deux langues sans recharger l'écran ni recalculer un
   * chiffre. Seuls les libellés changent — les nombres, eux, ne connaissent
   * aucune langue.</p>
   */
  readonly langue = signal<LangueRapport>('FR');

  /** Libellé traduit, pour le gabarit. */
  t(clef: string): string {
    return traduire(clef, this.langue());
  }

  /**
   * Libellé venu des données, traduit par correspondance.
   *
   * <p>Noms de scopes, de postes et de catégories : ils viennent de la
   * nomenclature et de la base, pas du gabarit. Un libellé sans correspondance
   * reste en français plutôt que de disparaître du tableau.</p>
   */
  l(libelle: string | null | undefined): string {
    return traduireDonnee(libelle, this.langue());
  }

  /** Provenances d'un poste, traduites une à une puis rassemblées. */
  originesTraduites(poste: PosteBilan): string {
    return poste.origines.map(origine => this.l(origine)).join(' · ');
  }

  /**
   * Choisit entre deux formulations selon la langue.
   *
   * <p>Les textes assemblés par le composant — analyses de scope, leviers,
   * vulnérabilités — ne peuvent pas passer par une clé de dictionnaire : ils
   * intercalent des chiffres. Les deux versions sont donc portées côte à côte,
   * là où la phrase se construit.</p>
   */
  private fe(fr: string, en: string): string {
    return this.langue() === 'EN' ? en : fr;
  }

  /** Locale des pipes `number` et `date`, alignée sur la langue retenue. */
  get locale(): string {
    return localeDe(this.langue());
  }

  /** Retient une langue ; le document se retraduit sans rechargement. */
  choisirLangue(langue: LangueRapport): void {
    this.langue.set(langue);
    this.cdr.markForCheck();
  }

  /** Langue du document, nommée sur la page de garde. */
  get langueLibelle(): string {
    return libelleLangue(this.langue());
  }

  // ---------- SECTION 3 : GAZ ET FACTEURS ----------

  readonly gazReference = GAZ_REFERENCE;

  /** Facteurs du référentiel, tels que la base les porte. */
  facteurs: FactorRow[] = [];

  /**
   * Ventilation par gaz du périmètre.
   *
   * <p>Elle vient de {@code EmissionFactor.gasDetails}, que l'API expose mais
   * qu'aucun facteur ne renseigne à ce jour. La section reste donc structurée et
   * se remplira d'elle-même le jour où le détail par gaz sera saisi ; en
   * attendant, elle le déclare plutôt que d'avancer une répartition inventée.</p>
   */
  get ventilationGaz(): { formule: string; contributionKg: number; pct: number }[] {
    return [];
  }

  /** Vrai lorsque le détail par gaz est renseigné en base. */
  get ventilationGazRenseignee(): boolean {
    return this.ventilationGaz.length > 0;
  }

  /**
   * Facteurs du mix local, ceux dont l'unité est une énergie.
   *
   * <p>Le mix électrique d'un pays n'est pas celui d'un autre : ces facteurs
   * sont les seuls du référentiel dont la valeur dépend de l'implantation, et le
   * rapport doit les nommer pour être vérifiable.</p>
   */
  get facteursEnergie(): FactorRow[] {
    return this.facteurs
      .filter(f => /^(kwh|mwh|gwh)$/i.test((f.unit ?? '').trim()))
      .sort((a, b) => (b.defaultFactorValue ?? 0) - (a.defaultFactorValue ?? 0));
  }

  /** Sociétés du pays retenu, nommées pour la règle de consolidation. */
  nomsFiliales(pays: PaysOption): string {
    return pays.filiales.map(f => f.libelle || f.code).join(', ');
  }

  /**
   * Prix de la tonne de carbone retenu pour l'exposition théorique.
   *
   * <p>Ordre de grandeur du système européen d'échange de quotas. Il est exposé
   * comme paramètre et non figé dans un calcul : le lecteur doit pouvoir
   * refaire le chiffre avec le prix qu'il juge pertinent.</p>
   */
  prixCarboneEuro = 80;

  /**
   * Top 5 des postes émetteurs, avec le cumul qu'ils représentent.
   *
   * <p>Le cumul est ce qui documente la concentration : cinq postes à 99 % du
   * total appellent une stratégie différente de cinq postes à 40 %.</p>
   */
  get topEmetteurs(): {
    rang: number; libelle: string; scopeNom: string; valeurT: number;
    pct: number; pctCumule: number; lignes: number; origines: string;
  }[] {
    const total = this.totalRetenuKg;
    let cumul = 0;

    return this.postesRetenus
      .filter(poste => poste.emissionKg > 0)
      .sort((a, b) => b.emissionKg - a.emissionKg)
      .slice(0, 5)
      .map((poste, index) => {
        const pct = total > 0 ? (poste.emissionKg / total) * 100 : 0;
        cumul += pct;

        return {
          rang: index + 1,
          libelle: poste.libelle,
          scopeNom: poste.scopeNom,
          valeurT: poste.emissionKg / 1000,
          pct,
          pctCumule: cumul,
          lignes: poste.lignes,
          origines: this.originesTraduites(poste)
        };
      });
  }

  /** Nombre de postes concentrant 80 % de l'empreinte retenue. */
  get postesPourQuatreVingts(): number {
    const total = this.totalRetenuKg;
    if (total <= 0) return 0;

    let cumul = 0;
    let compte = 0;

    for (const poste of [...this.postesRetenus].sort((a, b) => b.emissionKg - a.emissionKg)) {
      if (cumul >= 80) break;
      cumul += (poste.emissionKg / total) * 100;
      compte++;
    }
    return compte;
  }

  /**
   * Exposition théorique à une tarification du carbone.
   *
   * <p>Le calcul porte sur les Scopes 1 et 2, seuls visés par les mécanismes
   * d'ajustement aux frontières à ce stade. Il est <strong>théorique</strong> :
   * il indique un ordre de grandeur d'exposition, non une dette.</p>
   */
  get expositionCarbone(): { tonnes: number; montant: number; prix: number } | null {
    const bilan = this.bilan;
    if (!bilan) return null;

    const tonnes = (bilan.scope1Kg + bilan.scope2Kg) / 1000;
    return { tonnes, montant: tonnes * this.prixCarboneEuro, prix: this.prixCarboneEuro };
  }

  /**
   * Matrice de maturité de la donnée, par provenance.
   *
   * <p>La provenance dit ce qu'un auditeur pourra vérifier : une mesure en base
   * est traçable, un relevé du navigateur ne l'est pas encore.</p>
   */
  get maturiteDonnees(): {
    provenance: string; postes: number; tonnes: number; pct: number;
    maturite: string; verifiable: string;
  }[] {
    const total = this.totalRetenuKg;

    const familles = [
      { cle: 'Base de données', maturite: 'ELEVEE',
        verifiable: this.fe('Traçable jusqu\'à la ligne de mesure et à son facteur',
          'Traceable to the measurement record and its factor') },
      { cle: 'Ventilation comptable', maturite: 'MOYENNE',
        verifiable: this.fe(
          'Traçable au classeur importé ; la clé de répartition est à documenter',
          'Traceable to the imported workbook; the allocation key must be documented') },
      { cle: 'Saisie écran', maturite: 'FAIBLE',
        verifiable: this.fe(
          'Non soumise au serveur : hors de portée d\'une vérification externe',
          'Not submitted to the server: beyond the reach of external verification') }
    ];

    return familles.map(famille => {
      const postes = this.postesRetenus.filter(poste =>
        poste.origines.some(origine => origine === famille.cle));
      const kg = postes.reduce((somme, poste) => somme + poste.emissionKg, 0);

      return {
        provenance: this.l(famille.cle),
        maturite: famille.maturite,
        verifiable: famille.verifiable,
        postes: postes.length,
        tonnes: kg / 1000,
        pct: total > 0 ? (kg / total) * 100 : 0
      };
    }).filter(ligne => ligne.postes > 0);
  }

  /**
   * Analyse qualitative d'un scope, pour la section 4.
   *
   * <p>Le texte est dérivé du bilan : il nomme les postes réellement présents
   * plutôt que de commenter un profil supposé.</p>
   */
  analyseScope(code: string): string[] {
    const scope = this.scopesRetenus.find(s => s.code === code);
    if (!scope) return [];

    const postes = this.postesRetenus
      .filter(poste => poste.scopeCode === code && poste.emissionKg > 0)
      .sort((a, b) => b.emissionKg - a.emissionKg);

    if (!postes.length) {
      return [this.fe(
        `Aucun poste du ${scope.nom} n'est chiffré sur ce périmètre. L'absence de mesure `
        + `n'atteste pas d'une absence d'émission : elle marque un poste qui reste à collecter.`,
        `No ${scope.nom} source is quantified within this boundary. The absence of a measurement `
        + `does not evidence an absence of emissions: it marks a source still to be collected.`
      )];
    }

    const dominant = postes[0];
    const kgScope = postes.reduce((s, p) => s + p.emissionKg, 0);
    const pctDominant = kgScope > 0 ? (dominant.emissionKg / kgScope) * 100 : 0;

    const pctPerimetre = this.totalRetenuKg > 0 ? (kgScope / this.totalRetenuKg) * 100 : 0;

    const nomDominant = this.l(dominant.libelle);

    const lectures: string[] = [
      this.fe(
        `Le ${scope.nom} totalise ${this.tonnes(kgScope)} tCO₂e sur ${postes.length} poste(s) `
        + `collecté(s), soit ${this.formater(pctPerimetre, 1)} % de l'empreinte retenue au rapport.`,
        `${scope.nom} totals ${this.tonnes(kgScope)} tCO₂e across ${postes.length} collected `
        + `source(s), i.e. ${this.formater(pctPerimetre, 1)} % of the footprint reported.`
      ),

      this.fe(
        `Le poste dominant est « ${nomDominant} » : ${this.tonnes(dominant.emissionKg)} tCO₂e, `
        + `${this.formater(pctDominant, 1)} % du scope, sur ${dominant.lignes} ligne(s) de mesure `
        + `(${this.originesTraduites(dominant)}).`,
        `The dominant source is "${nomDominant}": ${this.tonnes(dominant.emissionKg)} tCO₂e, `
        + `${this.formater(pctDominant, 1)} % of the scope, from ${dominant.lignes} measurement `
        + `record(s) (${this.originesTraduites(dominant)}).`
      )
    ];

    if (pctDominant > 90) {
      lectures.push(this.fe(
        'Le scope repose sur un poste unique à plus de 90 % : toute action qui ne le traite pas '
        + 'restera sans effet mesurable, et toute erreur sur sa donnée d\'entrée se répercute '
        + 'intégralement sur le total.',
        'The scope rests on a single source for over 90 %: any action that does not address it '
        + 'will have no measurable effect, and any error in its input datum carries through to the '
        + 'total in full.'
      ));
    } else if (postes.length >= 3) {
      lectures.push(this.fe(
        'La charge est répartie sur plusieurs postes : la réduction passera par un faisceau '
        + 'd\'actions plutôt que par un levier unique.',
        'The load is spread across several sources: reduction will come from a set of actions '
        + 'rather than a single lever.'
      ));
    }

    const enAttente = this.postesEnAttente.filter(poste => poste.scopeCode === code);
    if (enAttente.length) {
      const noms = enAttente.map(poste => this.l(poste.libelle)).join(', ');
      lectures.push(this.fe(
        `${enAttente.length} poste(s) de la nomenclature restent sans mesure sur ce scope : `
        + `${noms}. L'empreinte du scope est donc minorée d'autant.`,
        `${enAttente.length} inventory source(s) remain without measurement in this scope: `
        + `${noms}. The scope's footprint is understated accordingly.`
      ));
    }

    return lectures;
  }

  /** Fiches de collecte, pour l'annexe méthodologique. */
  get fichesCollecte(): {
    poste: string; donnee: string; source: string; frequence: string; controle: string;
  }[] {
    const mensuelle = this.fe('Mensuelle', 'Monthly');
    const trimestrielle = this.fe('Trimestrielle', 'Quarterly');

    return [
      { poste: this.fe('Combustion des établissements', 'Stationary combustion'),
        donnee: this.fe('Volumes de gaz naturel et de fioul', 'Natural gas and fuel oil volumes'),
        source: this.fe('Factures fournisseur', 'Supplier invoices'), frequence: mensuelle,
        controle: this.fe('Rapprochement avec les relevés de compteur',
          'Reconciliation with meter readings') },
      { poste: this.fe('Électricité achetée', 'Purchased electricity'),
        donnee: this.fe('Consommation en kWh par site', 'Consumption in kWh per site'),
        source: this.fe('Factures du distributeur national', 'National utility invoices'),
        frequence: mensuelle,
        controle: this.fe('Contrôle de plausibilité sur la puissance souscrite',
          'Plausibility check against contracted capacity') },
      { poste: this.fe('Émissions fugitives', 'Fugitive emissions'),
        donnee: this.fe('Charge installée et recharges de fluide',
          'Installed charge and refrigerant top-ups'),
        source: this.fe('Registre de maintenance frigorifique', 'Refrigeration maintenance log'),
        frequence: this.fe('À chaque intervention', 'At each intervention'),
        controle: this.fe('Fluide, PRG et quantité exigés pour chaque ligne',
          'Refrigerant, GWP and quantity required for each record') },
      { poste: this.fe('Combustion des véhicules', 'Vehicle combustion'),
        donnee: this.fe('Litres de carburant et kilométrage', 'Fuel litres and mileage'),
        source: this.fe('Cartes carburant et carnets de bord', 'Fuel cards and logbooks'),
        frequence: mensuelle,
        controle: this.fe('Cohérence consommation / distance parcourue',
          'Consistency between consumption and distance travelled') },
      { poste: this.fe('Transport amont et aval', 'Upstream and downstream transport'),
        donnee: this.fe('Tonnes·kilomètres par mode', 'Tonne-kilometres by mode'),
        source: this.fe('Factures transporteurs et bons de livraison',
          'Carrier invoices and delivery notes'),
        frequence: mensuelle,
        controle: this.fe('Recoupement avec le tonnage expédié',
          'Cross-check against tonnage shipped') },
      { poste: this.fe('Biens et services achetés', 'Purchased goods and services'),
        donnee: this.fe('Montants ou masses par famille d\'achat',
          'Amounts or masses by purchasing family'),
        source: this.fe('Comptabilité fournisseurs', 'Accounts payable'),
        frequence: trimestrielle,
        controle: this.fe('Bascule des facteurs monétaires vers des facteurs physiques',
          'Shift from spend-based to physical factors') },
      { poste: this.fe('Déchets', 'Waste'),
        donnee: this.fe('Tonnages par filière de traitement', 'Tonnages by treatment stream'),
        source: this.fe('Bordereaux de suivi des déchets', 'Waste tracking forms'),
        frequence: mensuelle,
        controle: this.fe('Contrôle de la filière déclarée', 'Check of the declared stream') },
      { poste: this.fe('Déplacements professionnels', 'Business travel'),
        donnee: this.fe('Distances par mode de transport', 'Distances by mode of transport'),
        source: this.fe('Notes de frais et agence de voyage', 'Expense claims and travel agency'),
        frequence: trimestrielle,
        controle: this.fe('Distinction court et long courrier',
          'Short-haul and long-haul distinction') }
    ];
  }

  /** Règles d'exclusion appliquées à l'inventaire, pour l'annexe. */
  get reglesExclusion(): { regle: string; portee: string; justification: string }[] {
    return [
      { regle: this.fe('Seuil de matérialité', 'Materiality threshold'),
        portee: this.fe('Postes inférieurs à 0,1 % du total', 'Sources below 0.1 % of the total'),
        justification: this.fe(
          'Leur collecte coûterait davantage que la précision qu\'elle apporterait ; ils demeurent listés, jamais retirés silencieusement.',
          'Collecting them would cost more than the precision it would add; they remain listed, never removed silently.') },
      { regle: this.fe('Sociétés hors contrôle opérationnel', 'Entities outside operational control'),
        portee: this.fe('Participations minoritaires', 'Minority interests'),
        justification: this.fe(
          'Cohérence avec l\'approche de consolidation retenue au §2.',
          'Consistency with the consolidation approach applied in §2.') },
      { regle: this.fe('Émissions biogéniques', 'Biogenic emissions'),
        portee: this.fe('CO₂ issu de la biomasse', 'CO₂ from biomass'),
        justification: this.fe(
          'Déclaré séparément du total selon le GHG Protocol, et non additionné.',
          'Reported separately from the total under the GHG Protocol, and not added in.') },
      { regle: this.fe('Double comptage inter-scopes', 'Cross-scope double counting'),
        portee: this.fe('Énergie déjà comptée en Scope 2', 'Energy already counted in Scope 2'),
        justification: this.fe(
          'La catégorie 3 du Scope 3 ne reprend que les pertes amont, à l\'exclusion de l\'énergie livrée.',
          'Scope 3 category 3 covers upstream losses only, excluding the energy delivered.') },
      { regle: this.fe('Lignes ventilées', 'Allocated records'),
        portee: this.fe('Postes issus d\'une répartition comptable',
          'Sources arising from an accounting allocation'),
        justification: this.fe(
          'Comptés une seule fois : le magasin de répartition les porte, les écrans de saisie ne les reprennent pas.',
          'Counted once only: the allocation store holds them, the entry screens do not repeat them.') }
    ];
  }

  /**
   * Ordre de grandeur sectoriel indicatif d'un ratio.
   *
   * <p>Ces fourchettes relèvent de la pratique de l'équipementier automobile et
   * de la transformation plastique. Elles ne sont pas auditées : elles servent de
   * test de plausibilité, et le rapport le dit.</p>
   */
  fourchetteIndicative(ratio: RatioIntensite): string {
    if (/employ|salari/i.test(ratio.libelle)) {
      return this.fe('2 à 20 tCO₂e / employé', '2 to 20 tCO₂e / employee');
    }
    if (/produit|pièce|unit/i.test(ratio.libelle)) {
      return this.fe('0,5 à 5 kgCO₂e / unité', '0.5 to 5 kgCO₂e / unit');
    }
    if (/affaires|chiffre|million/i.test(ratio.libelle)) {
      return this.fe('20 à 150 tCO₂e / M de devise', '20 to 150 tCO₂e / M currency');
    }
    return this.fe('Aucun repère sectoriel retenu', 'No sector benchmark applied');
  }

  /** Lecture critique d'un ratio : ce que le chiffre dit, ou ce qui l'empêche. */
  lectureRatio(ratio: RatioIntensite): string {
    if (ratio.valeur === null) {
      const motif = ratio.manque || this.fe('dénominateur absent', 'denominator missing');
      return this.fe(`Non calculable — ${motif}.`, `Not computable — ${motif}.`);
    }
    return this.fe(
      'Comparer à la fourchette avant toute conclusion : un écart de plusieurs ordres de '
      + 'grandeur signale une donnée d\'entrée à vérifier, non une performance.',
      'Compare with the range before drawing any conclusion: a gap of several orders of '
      + 'magnitude signals an input datum to be checked, not a performance.'
    );
  }

  /**
   * Risques d'exposition du périmètre.
   *
   * <p>L'exposition est dérivée du bilan — la part d'un scope, le nombre de
   * postes non collectés — et non saisie : un risque chiffré à la main ne serait
   * pas reproductible d'un exercice à l'autre.</p>
   */
  get vulnerabilites(): {
    intitule: string; nature: string; exposition: string;
    probabilite: string; impact: string;
  }[] {
    const bilan = this.bilan;
    if (!bilan) return [];

    const pctScope2 = bilan.totalKg > 0 ? (bilan.scope2Kg / bilan.totalKg) * 100 : 0;
    const pctScope3 = bilan.totalKg > 0 ? (bilan.scope3Kg / bilan.totalKg) * 100 : 0;
    const nonCollectes = this.postesEnAttente.length;

    return [
      {
        intitule: this.fe('Renchérissement de l\'électricité de réseau',
          'Rising grid electricity cost'),
        nature: this.fe('Transition', 'Transition'),
        exposition: this.fe(`${this.formater(pctScope2, 1)} % de l'empreinte (Scope 2)`,
          `${this.formater(pctScope2, 1)} % of the footprint (Scope 2)`),
        probabilite: pctScope2 > 40 ? 'ELEVEE' : 'MOYENNE',
        impact: pctScope2 > 40 ? 'ELEVE' : 'MOYEN'
      },
      {
        intitule: this.fe('Tarification carbone aux frontières (MACF / CBAM)',
          'Carbon border adjustment (CBAM)'),
        nature: this.fe('Transition', 'Transition'),
        exposition: this.fe(
          `Scopes 1 et 2 : ${this.tonnes(bilan.scope1Kg + bilan.scope2Kg)} tCO₂e`,
          `Scopes 1 and 2: ${this.tonnes(bilan.scope1Kg + bilan.scope2Kg)} tCO₂e`),
        probabilite: 'ELEVEE',
        impact: 'ELEVE'
      },
      {
        intitule: this.fe('Exigence de transparence de la chaîne de valeur',
          'Value chain transparency requirement'),
        nature: this.fe('Transition', 'Transition'),
        exposition: this.fe(`Scope 3 documenté à ${this.formater(pctScope3, 1)} % du total`,
          `Scope 3 documented at ${this.formater(pctScope3, 1)} % of the total`),
        probabilite: 'MOYENNE',
        impact: pctScope3 < 10 ? 'ELEVE' : 'MOYEN'
      },
      {
        intitule: this.fe('Inventaire incomplet — postes non collectés',
          'Incomplete inventory — sources not collected'),
        nature: this.fe('Physique', 'Physical'),
        exposition: this.fe(`${nonCollectes} poste(s) de la nomenclature sans mesure`,
          `${nonCollectes} inventory source(s) with no measurement`),
        probabilite: nonCollectes > 5 ? 'ELEVEE' : 'FAIBLE',
        impact: nonCollectes > 5 ? 'ELEVE' : 'FAIBLE'
      }
    ];
  }

  /**
   * Jalons de la trajectoire Net-Zero.
   *
   * <p>Les pourcentages sont ceux du référentiel SBTi pour une trajectoire
   * 1,5 °C ; les horizons suivent l'exercice consulté plutôt que des années
   * figées, pour qu'un rapport de 2030 ne cite pas 2028 comme un avenir.</p>
   */
  get jalonsTrajectoire(): {
    horizon: number; perimetre: string; reductionPct: number;
    referentiel: string; statut: string;
  }[] {
    const base = this.bilan?.annee ?? new Date().getFullYear();
    const aEngager = this.fe('À engager', 'To be committed');
    const scopes12 = this.fe('Scopes 1 et 2', 'Scopes 1 and 2');

    return [
      { horizon: base, perimetre: this.fe('Inventaire complet', 'Full inventory'), reductionPct: 0,
        referentiel: this.fe('ISO 14064-1 — inventaire vérifiable',
          'ISO 14064-1 — verifiable inventory'),
        statut: this.fe('Prérequis', 'Prerequisite') },
      { horizon: 2028, perimetre: scopes12, reductionPct: 25,
        referentiel: this.fe('Jalon intermédiaire', 'Interim milestone'), statut: aEngager },
      { horizon: 2030, perimetre: scopes12, reductionPct: 42,
        referentiel: this.fe('SBTi — trajectoire 1,5 °C, cible court terme',
          'SBTi — 1.5 °C pathway, near-term target'), statut: aEngager },
      { horizon: 2030, perimetre: 'Scope 3', reductionPct: 25,
        referentiel: this.fe('SBTi — ambition Scope 3', 'SBTi — Scope 3 ambition'),
        statut: aEngager },
      { horizon: 2040, perimetre: this.fe('Scopes 1, 2 et 3', 'Scopes 1, 2 and 3'),
        reductionPct: 90, referentiel: 'SBTi Corporate Net-Zero Standard',
        statut: this.fe('Cible long terme', 'Long-term target') }
    ];
  }

  /**
   * Leviers de décarbonation, ordonnés par le poids réel des postes.
   *
   * <p>Le premier levier n'est pas technique : un objectif adossé à une année de
   * référence non auditée n'est pas opposable.</p>
   */
  get leviers(): {
    titre: string; poste: string; action: string; impact: string; priorite: string;
  }[] {
    const bilan = this.bilan;
    const pctScope2 = bilan && bilan.totalKg > 0 ? (bilan.scope2Kg / bilan.totalKg) * 100 : 0;

    return [
      {
        titre: this.fe('Fiabiliser l\'inventaire', 'Make the inventory reliable'),
        poste: this.fe('Tous scopes', 'All scopes'),
        action: this.fe(
          'Compléter les postes non collectés et faire vérifier l\'année de référence, préalable à tout engagement chiffré.',
          'Complete the sources not collected and have the base year verified, a prerequisite to any quantified commitment.'),
        impact: this.fe(`${this.postesEnAttente.length} poste(s) à couvrir`,
          `${this.postesEnAttente.length} source(s) to cover`),
        priorite: 'P0'
      },
      {
        titre: this.fe('Efficacité énergétique', 'Energy efficiency'),
        poste: this.fe('Électricité achetée', 'Purchased electricity'),
        action: this.fe(
          'Variation de vitesse, récupération de chaleur, relamping LED, optimisation de l\'air comprimé.',
          'Variable-speed drives, heat recovery, LED relamping, compressed-air optimisation.'),
        impact: this.fe(`−10 à −20 % du Scope 2 (${this.formater(pctScope2, 1)} % du total)`,
          `−10 to −20 % of Scope 2 (${this.formater(pctScope2, 1)} % of the total)`),
        priorite: 'P1'
      },
      {
        titre: this.fe('Électricité renouvelable', 'Renewable electricity'),
        poste: this.fe('Électricité achetée', 'Purchased electricity'),
        action: this.fe(
          'Autoproduction photovoltaïque en toiture, puis contractualisation (PPA ou garanties d\'origine) permettant une publication market-based.',
          'Rooftop photovoltaic self-generation, then contracting (PPA or guarantees of origin) enabling market-based reporting.'),
        impact: this.fe('−30 à −70 % du Scope 2 market-based',
          '−30 to −70 % of market-based Scope 2'),
        priorite: 'P2'
      },
      {
        titre: this.fe('Maîtrise des fluides frigorigènes', 'Refrigerant containment'),
        poste: this.fe('Émissions fugitives', 'Fugitive emissions'),
        action: this.fe(
          'Détection systématique des fuites, maintenance préventive, migration vers des fluides à faible PRG.',
          'Systematic leak detection, preventive maintenance, migration to low-GWP refrigerants.'),
        impact: this.fe('−50 à −80 % des émissions fugitives',
          '−50 to −80 % of fugitive emissions'),
        priorite: 'P1'
      }
    ];
  }

  /** Facteurs de combustion et de matière, hors énergie de réseau. */
  get facteursAutres(): FactorRow[] {
    return this.facteurs
      .filter(f => /^(l|kg|t|tonne|tonnes|km)$/i.test((f.unit ?? '').trim()))
      .sort((a, b) => (b.defaultFactorValue ?? 0) - (a.defaultFactorValue ?? 0))
      .slice(0, 12);
  }

  constructor(@Inject(PLATFORM_ID) private readonly platformId: Object) {
    // Le filtre pays n'est pas un signal de plus dans la chaîne du tableau de
    // bord : il l'affine. Un changement de pays rejoue donc le même chargement
    // que l'en-tête, avec le périmètre élargi aux sociétés de ce pays.
    effect(() => {
      const pays = this.filtres.paysActif();
      this.chargerPerimetre(pays, this.entityService.filter);
    });
  }

  /**
   * Charge le bilan du périmètre consulté.
   *
   * <p>Deux axes le déterminent : l'en-tête, qui retient une société et un
   * exercice, et le filtre pays du rapport. Un pays réunissant plusieurs
   * sociétés — la Tunisie en compte trois — son bilan est chargé société par
   * société puis fusionné, le serveur n'agrégeant que par société.</p>
   *
   * <p>Sans pays retenu, le périmètre reste celui de l'en-tête : le rapport ne
   * s'écarte jamais de la console qui l'a ouvert sans qu'on l'ait demandé.</p>
   */
  private chargerPerimetre(pays: PaysOption | null, filtre: EntityFilter): void {
    const entityIds = (pays?.filiales ?? []).map(f => f.id);
    const annee = filtre.year;

    // La clé évite de rejouer une requête identique : les deux axes se
    // rafraîchissent indépendamment et peuvent notifier le même périmètre.
    const clef = `${pays?.nom ?? 'AUCUN'}|${entityIds.join(',')}|${filtre.entityId ?? 'GROUPE'}`
      + `|${filtre.usineId ?? 'TOUTES'}|${annee ?? 'TOUS'}`;
    if (clef === this.clefChargement) return;
    this.clefChargement = clef;

    this.chargement = true;
    this.dateImpression = new Date();

    // Sans pays retenu, le chargement reste celui de l'en-tête, usine comprise.
    const bilan$ = pays
      ? this.bilanService.chargerConsolide(entityIds, annee, {
          libelleSociete: `${pays.nom} — ${pays.filiales.length} société(s)`,
          pays: pays.nom,
          devise: this.filtres.devise(),
          annee,
          libelleExercice: this.filtres.libelleExercice()
        })
      : this.bilanService.charger(filtre.entityId, filtre.usineId, annee);

    this.abonnements.add(
      bilan$
        .pipe(catchError(() => of(null)))
        .subscribe(bilan => {
          this.bilan = bilan;
          this.chargement = false;
          this.appliquerPrechoix();
          this.relireParametres();
          // `markForCheck` suffit : l'application est sans zone, et un
          // `detectChanges` déclenché depuis un abonnement rouvrirait un cycle
          // à l'intérieur de celui qui court déjà.
          this.cdr.markForCheck();

          // Le rapprochement et l'année de référence suivent le périmètre. En
          // consolidation multi-sociétés, ils portent sur le groupe entier
          // plutôt que sur une société qu'aucun filtre n'a désignée.
          const entityId = pays
            ? (entityIds.length === 1 ? entityIds[0] : null)
            : filtre.entityId;
          this.chargerComparaison(entityId, pays ? null : filtre.usineId, annee);
          this.chargerAnneeReference(entityId, pays ? null : filtre.usineId);
        })
    );
  }

  ngOnInit(): void {
    this.auteur = this.auteurParDefaut();

    // Les facteurs du référentiel ne dépendent pas du périmètre : ils sont lus
    // une fois, et la section 3 nomme ceux qu'elle applique.
    this.abonnements.add(
      this.referentialService.getFactorRows()
        .pipe(catchError(() => of([] as FactorRow[])))
        .subscribe(lignes => {
          this.facteurs = lignes ?? [];
          this.cdr.markForCheck();
        })
    );

    // L'en-tête reste le pilote du périmètre ; le filtre pays du rapport
    // l'affine, depuis l'effet du constructeur. Les deux passent par le même
    // chargement, dont la clé écarte les rejeux inutiles.
    this.abonnements.add(
      this.entityService.filter$.subscribe(filtre => {
        this.chargerPerimetre(this.filtres.paysActif(), filtre);
      })
    );
  }

  ngOnDestroy(): void {
    this.abonnements.unsubscribe();
  }

  // ---------- CHARGEMENT ----------

  // Le chargement par société seule a laissé place à `chargerPerimetre`, qui
  // consolide un pays entier. Voir le constructeur.

  /**
   * Charge le bilan de l'année de référence du chapitre 4.
   *
   * <p>Sans lui, la trajectoire annoncée dans le rapport normé reposerait sur
   * un chiffre saisi à la main — exactement ce qu'un auditeur cherche à
   * écarter.</p>
   */
  private chargerAnneeReference(entityId: number | null, usineId: number | null): void {
    const reference = this.parametres.anneeReference;
    this.bilanReference = null;

    if (reference === null || reference === this.bilan?.annee) return;

    this.abonnements.add(
      this.bilanService.charger(entityId, usineId, reference)
        .pipe(catchError(() => of(null)))
        .subscribe(bilan => {
          this.bilanReference = bilan;
          this.cdr.markForCheck();
        })
    );
  }

  /** Bilan de l'exercice précédent, pour la lecture des variations. */
  private chargerComparaison(entityId: number | null, usineId: number | null, annee: number | null): void {
    this.comparaison = null;
    if (annee === null) return;

    this.abonnements.add(
      this.bilanService.charger(entityId, usineId, annee - 1)
        .pipe(catchError(() => of(null)))
        .subscribe(precedent => {
          this.comparaison = this.rapprocher(precedent, annee - 1);
          this.cdr.markForCheck();
        })
    );
  }

  /**
   * Écarts entre l'exercice consulté et le précédent.
   *
   * <p>Un exercice précédent sans aucune mesure n'est pas un exercice à zéro :
   * c'est un exercice non collecté. Le rapprochement est alors tu, plutôt que
   * d'annoncer une hausse de 100 % qui ne dirait rien de la trajectoire.</p>
   */
  private rapprocher(precedent: BilanCarbone | null, annee: number): Comparaison | null {
    if (!precedent || !this.bilan || precedent.totalKg <= 0) return null;

    const parId = new Map(precedent.postes.map(p => [p.id, p.emissionKg]));
    const ecarts: EcartPoste[] = this.bilan.postes
      .map(poste => {
        const avant = parId.get(poste.id) ?? 0;
        const deltaKg = poste.emissionKg - avant;
        return {
          libelle: poste.libelle,
          deltaKg,
          deltaPct: avant > 0 ? (deltaKg / avant) * 100 : null
        };
      })
      .filter(ecart => Math.abs(ecart.deltaKg) > 0.5);

    const deltaKg = this.bilan.totalKg - precedent.totalKg;

    return {
      annee,
      totalKg: precedent.totalKg,
      deltaKg,
      deltaPct: precedent.totalKg > 0 ? (deltaKg / precedent.totalKg) * 100 : null,
      hausses: ecarts.filter(e => e.deltaKg > 0).sort((a, b) => b.deltaKg - a.deltaKg).slice(0, 3),
      baisses: ecarts.filter(e => e.deltaKg < 0).sort((a, b) => a.deltaKg - b.deltaKg).slice(0, 3)
    };
  }

  /** Nom de l'utilisateur connecté, à défaut la direction du groupe. */
  private auteurParDefaut(): string {
    if (!isPlatformBrowser(this.platformId)) return 'Direction QHSE — Groupe MISFAT';

    try {
      const nom = localStorage.getItem('userFullName')
        ?? localStorage.getItem('username')
        ?? sessionStorage.getItem('username');
      return nom?.trim() || 'Direction QHSE — Groupe MISFAT';
    } catch {
      return 'Direction QHSE — Groupe MISFAT';
    }
  }

  // ---------- PANNEAU DE CONFIGURATION ----------

  /**
   * Pré-cochage : les postes qui pèsent, et eux seuls.
   *
   * <p>Un rapport exécutif se lit en quelques minutes. Y faire figurer d'office
   * quinze catégories à zéro noierait les trois qui portent le bilan ; les
   * exclure d'office priverait le lecteur d'une information de pilotage. Elles
   * restent donc proposées, décochées, à un clic du document.</p>
   */
  private appliquerPrechoix(): void {
    this.retenus = new Set(
      (this.bilan?.postes ?? []).filter(poste => poste.emissionKg > 0).map(poste => poste.id)
    );
  }

  estRetenu(posteId: string): boolean {
    return this.retenus.has(posteId);
  }

  basculerPoste(posteId: string): void {
    if (this.retenus.has(posteId)) this.retenus.delete(posteId);
    else this.retenus.add(posteId);
  }

  /** Postes d'un scope, enrichis de leur valeur sur le périmètre courant. */
  postesDuScope(code: string): PosteBilan[] {
    return this.bilan?.scopes.find(scope => scope.code === code)?.postes ?? [];
  }

  /** Nombre de postes retenus dans un scope, pour la case d'en-tête. */
  retenusDuScope(code: string): number {
    return this.postesDuScope(code).filter(poste => this.retenus.has(poste.id)).length;
  }

  scopeEntierementRetenu(code: string): boolean {
    const postes = this.postesDuScope(code);
    return postes.length > 0 && postes.every(poste => this.retenus.has(poste.id));
  }

  /** Coche ou décoche un scope entier depuis son en-tête. */
  basculerScope(code: string): void {
    const postes = this.postesDuScope(code);
    if (this.scopeEntierementRetenu(code)) {
      postes.forEach(poste => this.retenus.delete(poste.id));
    } else {
      postes.forEach(poste => this.retenus.add(poste.id));
    }
  }

  /** Sélectionne l'intégralité du bilan, catégories non collectées comprises. */
  toutCocher(): void {
    this.retenus = new Set((this.bilan?.postes ?? []).map(poste => poste.id));
  }

  /** Ne retient que les catégories effectivement chiffrées. */
  uniquementActives(): void {
    this.appliquerPrechoix();
  }

  toutDecocher(): void {
    this.retenus.clear();
  }

  get nombreRetenus(): number {
    return this.retenus.size;
  }

  get nombrePostes(): number {
    return this.bilan?.postes.length ?? 0;
  }

  // ---------- CONTENU DU RAPPORT ----------

  /** Postes retenus, dans l'ordre de la nomenclature. */
  get postesRetenus(): PosteBilan[] {
    return (this.bilan?.postes ?? []).filter(poste => this.retenus.has(poste.id));
  }

  /** Scopes ayant au moins un poste retenu, avec leurs seuls postes retenus. */
  get scopesRetenus(): { code: string; nom: string; soustitre: string; couleur: string;
                         emissionKg: number; postes: PosteBilan[] }[] {
    return (this.bilan?.scopes ?? [])
      .map(scope => ({
        code: scope.code,
        nom: scope.nom,
        soustitre: scope.soustitre,
        couleur: scope.couleur,
        postes: scope.postes.filter(poste => this.retenus.has(poste.id)),
        emissionKg: scope.postes
          .filter(poste => this.retenus.has(poste.id))
          .reduce((somme, poste) => somme + poste.emissionKg, 0)
      }))
      .filter(scope => scope.postes.length > 0);
  }

  /**
   * Total des postes retenus.
   *
   * <p>Il suit la sélection : afficher le total du bilan sous un tableau
   * restreint laisserait croire que la somme des lignes visibles ne correspond
   * pas au pied de tableau.</p>
   */
  get totalRetenuKg(): number {
    return this.postesRetenus.reduce((somme, poste) => somme + poste.emissionKg, 0);
  }

  /** Part du bilan couverte par les postes retenus. */
  get couvertureRetenue(): number {
    const total = this.bilan?.totalKg ?? 0;
    return total ? (this.totalRetenuKg / total) * 100 : 0;
  }

  /** Cartes de synthèse : total puis répartition par scope. */
  get cartesKpi(): { libelle: string; valeurT: number; pct: number; couleur: string; note: string }[] {
    const bilan = this.bilan;
    if (!bilan) return [];

    const total = bilan.totalKg;
    const part = (valeur: number) => (total ? (valeur / total) * 100 : 0);

    return [
      {
        libelle: 'Empreinte totale', valeurT: total / 1000, pct: 100, couleur: '#0f172a',
        note: `${bilan.mesures} ligne(s) de mesure`
      },
      {
        libelle: 'Scope 1 · Direct', valeurT: bilan.scope1Kg / 1000, pct: part(bilan.scope1Kg),
        couleur: '#16a34a', note: 'Combustion, flotte, fugitives'
      },
      {
        libelle: 'Scope 2 · Énergie', valeurT: bilan.scope2Kg / 1000, pct: part(bilan.scope2Kg),
        couleur: '#ea580c', note: 'Électricité, vapeur, réseaux'
      },
      {
        libelle: 'Scope 3 · Chaîne de valeur', valeurT: bilan.scope3Kg / 1000, pct: part(bilan.scope3Kg),
        couleur: '#0284c7', note: '15 catégories GHG Protocol'
      }
    ];
  }

  // ---------- RATIOS D'INTENSITÉ DE LA SYNTHÈSE ----------

  /**
   * Trois ratios d'intensité, sous le bandeau des scopes.
   *
   * <p>Ils rapportent l'empreinte à l'activité : c'est ce qui distingue une
   * baisse due à un effort de décarbonation d'une baisse due à un
   * ralentissement de la production. Aucun dénominateur n'est supposé — un
   * ratio dont l'activité n'a pas été saisie reste vide et dit où la
   * renseigner, plutôt que d'afficher un chiffre que personne ne pourrait
   * défendre en comité.</p>
   *
   * <p>La devise est celle du périmètre : afficher des euros sur un bilan
   * tunisien libellé en dinars fausserait la lecture d'un facteur trois.</p>
   */
  get ratiosSynthese(): RatioSynthese[] {
    const totalKg = this.bilan?.totalKg ?? 0;
    const totalT = totalKg / 1000;
    const devise = this.bilan?.devise ?? 'TND';
    const p = this.parametres;

    const carte = (
      id: string, libelle: string, unite: string,
      valeur: number | null, decimales: number, ou: string
    ): RatioSynthese => ({
      id, libelle, valeur, unite,
      affichage: valeur === null ? '—' : this.formater(valeur, decimales),
      infobulle: valeur === null
        ? `Donnée d'activité absente : ${ou} pour que ce ratio soit calculé.`
        : `${this.formater(valeur, decimales)} ${unite} sur le périmètre `
          + `${this.bilan?.libelleSociete} — exercice ${this.bilan?.libelleExercice}.`
    });

    const { chiffreAffairesM, production, effectif } = this.activite;

    // En consolidation groupe, la devise vaut « Multi-devise » : l'accoler à
    // l'unité donnerait « M Multi-devise », qui ne veut rien dire. Seul un code
    // monétaire est affiché ; à défaut l'unité reste muette sur la monnaie.
    const code = /^[A-Z]{2,4}$/.test(devise) ? devise : '';

    // Le chiffre d'affaires est tenu en millions : la division est directe.
    const ou = (quoi: string) =>
      `renseignez ${quoi} dans l'écran « Données d'Activité & KPI »`;

    return [
      carte('economique', 'Ratio économique', `tCO₂e / M ${code}`.trim(),
        chiffreAffairesM && chiffreAffairesM > 0 ? totalT / chiffreAffairesM : null, 2,
        ou("le chiffre d'affaires de l'exercice")),

      carte('production', 'Ratio de production', 'kgCO₂e / unité',
        production && production > 0 ? totalKg / production : null, 3,
        ou("le volume de production de l'exercice")),

      carte('collaborateur', 'Ratio par collaborateur', 'tCO₂e / ETP',
        effectif && effectif > 0 ? totalT / effectif : null, 2,
        ou("l'effectif de l'exercice"))
    ];
  }

  /** Au moins un ratio est-il calculable ? */
  get ratiosRenseignes(): boolean {
    return this.ratiosSynthese.some(ratio => ratio.valeur !== null);
  }

  // ---------- TRAJECTOIRE DE DÉCARBONATION ----------

  /**
   * Position de l'exercice sur la trajectoire de réduction.
   *
   * <p>La cible s'applique à l'empreinte de l'année de référence, comme le veut
   * le GHG Protocol : l'asseoir sur l'exercice courant ferait glisser
   * l'objectif d'année en année, et le rendrait inatteignable par
   * construction.</p>
   */
  get trajectoire(): Trajectoire | null {
    const objectif = this.objectif;
    const pct = this.parametres.objectifPct;
    if (!objectif || pct === null || !this.bilan) return null;

    const actuelKg = this.bilan.totalKg;
    const ecartKg = actuelKg - objectif.cibleKg;

    // Effort accompli rapporté à l'effort demandé. Une réduction requise nulle
    // — objectif de 0 % — rend la progression sans objet : elle vaut 100 %.
    const requise = objectif.baseKg - objectif.cibleKg;
    const realisee = objectif.baseKg - actuelKg;
    const progression = requise > 0
      ? Math.min(100, Math.max(0, (realisee / requise) * 100))
      : 100;

    return {
      objectifPct: pct,
      anneeCible: this.parametres.anneeCible,
      anneeBase: this.parametres.anneeReference,
      baseKg: objectif.baseKg,
      cibleKg: objectif.cibleKg,
      actuelKg,
      ecartKg,
      ecartPct: objectif.cibleKg > 0 ? (ecartKg / objectif.cibleKg) * 100 : null,
      progression,
      atteint: objectif.atteint
    };
  }

  /** Texte du badge d'écart, tel qu'il se lit en comité. */
  get badgeTrajectoire(): string {
    const trajectoire = this.trajectoire;
    if (!trajectoire) return 'Objectif non défini';

    const ecart = this.tonnes(Math.abs(trajectoire.ecartKg));
    return trajectoire.atteint
      ? `Objectif atteint · ${ecart} tCO₂e sous la cible`
      : `${ecart} tCO₂e au-dessus de la cible`;
  }

  /**
   * Segments du diagramme circulaire, sur les seuls scopes retenus.
   *
   * <p>Le tracé est un SVG et non un dégradé conique : l'impression rend les
   * traits vectoriels sans dépendre de l'option « graphiques d'arrière-plan »
   * du navigateur, que peu d'utilisateurs pensent à activer.</p>
   */
  get segmentsDonut(): SegmentDonut[] {
    const scopes = this.scopesRetenus.filter(scope => scope.emissionKg > 0);
    const total = scopes.reduce((somme, scope) => somme + scope.emissionKg, 0);
    if (!total) return [];

    let curseur = 0;
    return scopes.map(scope => {
      const pct = (scope.emissionKg / total) * 100;
      const longueur = (pct / 100) * this.circonference;
      const segment: SegmentDonut = {
        libelle: scope.nom,
        couleur: scope.couleur,
        valeurKg: scope.emissionKg,
        pct,
        longueur,
        decalage: -curseur
      };
      curseur += longueur;
      return segment;
    });
  }

  /** Le donut a-t-il quelque chose à montrer ? */
  get donutRenseigne(): boolean {
    return this.segmentsDonut.length > 0;
  }

  /**
   * Bâtons des principaux contributeurs, hauteur relative au plus fort.
   *
   * <p>Une échelle rapportée au total écraserait tous les postes secondaires
   * contre la ligne de base sur une répartition déséquilibrée — et c'est la
   * règle plus que l'exception sur un bilan carbone.</p>
   */
  get batonsContributeurs(): { libelle: string; valeurT: number; pct: number;
                               largeur: number; couleur: string }[] {
    const postes = this.postesRetenus
      .filter(poste => poste.emissionKg > 0)
      .sort((a, b) => b.emissionKg - a.emissionKg)
      .slice(0, 8);

    if (!postes.length) return [];

    const maximum = postes[0].emissionKg;
    const total = this.totalRetenuKg;

    return postes.map(poste => ({
      libelle: poste.libelle,
      valeurT: poste.emissionKg / 1000,
      pct: total ? (poste.emissionKg / total) * 100 : 0,
      // Plancher de 2 % : un bâton nul en largeur disparaîtrait sous son socle.
      largeur: maximum > 0 ? Math.max((poste.emissionKg / maximum) * 100, 2) : 0,
      couleur: poste.scopeCouleur
    }));
  }

  /** Postes chiffrés retenus, du plus fort contributeur au plus faible. */
  private get contributeurs(): PosteBilan[] {
    return this.postesRetenus
      .filter(poste => poste.emissionKg > 0)
      .sort((a, b) => b.emissionKg - a.emissionKg);
  }

  /** Postes retenus mais non chiffrés : une collecte à lancer, pas un zéro. */
  get postesEnAttente(): PosteBilan[] {
    return this.postesRetenus.filter(poste => poste.emissionKg <= 0);
  }

  /**
   * Analyse rédigée du bilan, en quelques paragraphes.
   *
   * <p>Chaque phrase s'appuie sur un chiffre du rapport : le texte commente ce
   * que le lecteur a sous les yeux, il n'ajoute aucune donnée qui ne serait pas
   * dans les tableaux.</p>
   */
  get analyse(): string[] {
    const bilan = this.bilan;
    if (!bilan) return [];

    const paragraphes: string[] = [];
    const total = this.totalRetenuKg;

    if (total <= 0) {
      paragraphes.push(
        `Aucune émission n'est chiffrée sur le périmètre ${bilan.libelleSociete} pour `
        + `l'exercice ${bilan.libelleExercice}. Les catégories retenues au rapport attendent leur `
        + 'collecte : le document atteste du périmètre examiné, non d\'une empreinte nulle.'
      );
      return paragraphes;
    }

    const scopes = this.scopesRetenus
      .filter(scope => scope.emissionKg > 0)
      .sort((a, b) => b.emissionKg - a.emissionKg);

    if (scopes.length) {
      const dominant = scopes[0];
      paragraphes.push(
        `L'empreinte retenue s'établit à ${this.formater(total / 1000, 2)} tCO₂e sur le périmètre `
        + `${bilan.libelleSociete}, exercice ${bilan.libelleExercice}. Le ${dominant.nom} en concentre `
        + `${this.formater((dominant.emissionKg / total) * 100, 1)} %, soit `
        + `${this.formater(dominant.emissionKg / 1000, 2)} tCO₂e : c'est là que se joue l'essentiel de `
        + 'la trajectoire de réduction.'
      );
    }

    const tete = this.contributeurs.slice(0, 3);
    if (tete.length) {
      const cumul = tete.reduce((somme, poste) => somme + poste.emissionKg, 0);
      const enumeration = tete
        .map(poste => `${poste.libelle} (${this.formater(poste.emissionKg / 1000, 2)} tCO₂e, `
          + `${this.formater((poste.emissionKg / total) * 100, 1)} %)`)
        .join(' ; ');
      paragraphes.push(
        `Trois postes portent ${this.formater((cumul / total) * 100, 1)} % du bilan retenu : `
        + `${enumeration}. Toute action de réduction engagée ailleurs pèsera d'un poids marginal `
        + 'tant que ces postes n\'auront pas été traités.'
      );
    }

    const comparaison = this.comparaison;
    if (comparaison && comparaison.deltaPct !== null) {
      const sens = comparaison.deltaKg >= 0 ? 'progresse' : 'recule';
      const moteur = comparaison.deltaKg >= 0 ? comparaison.hausses[0] : comparaison.baisses[0];
      const explication = moteur
        ? ` Le mouvement tient d'abord à ${moteur.libelle}, qui varie de `
          + `${this.formater(moteur.deltaKg / 1000, 2)} tCO₂e.`
        : '';
      paragraphes.push(
        `Rapportée à l'exercice ${comparaison.annee} (${this.formater(comparaison.totalKg / 1000, 2)} tCO₂e), `
        + `l'empreinte ${sens} de ${this.formater(Math.abs(comparaison.deltaPct), 1)} %.${explication} `
        + 'La comparaison ne vaut qu\'à périmètre de collecte constant : une catégorie documentée cette '
        + 'année et non l\'an dernier gonfle mécaniquement l\'écart.'
      );
    }

    const attente = this.postesEnAttente;
    if (attente.length) {
      paragraphes.push(
        `${attente.length} catégorie(s) retenue(s) au rapport ne sont pas encore chiffrées `
        + `(${attente.map(poste => poste.libelle).join(', ')}). Leur présence à zéro atteste qu'elles `
        + 'ont été examinées ; elle ne préjuge pas de leur poids réel une fois collectées.'
      );
    }

    if (!bilan.serveurJoignable) {
      paragraphes.push(
        'Le service d\'agrégation n\'a pas répondu : le bilan ci-dessus repose sur les seules données '
        + 'conservées dans le navigateur — ventilation comptable et saisies des écrans. Il doit être '
        + 'reconduit une fois le service rétabli avant toute diffusion externe.'
      );
    }

    return paragraphes;
  }

  // ---------- MODE 2 : PARAMÈTRES, CHAPITRES ET ÉDITION ----------

  /** Clé de persistance des paramètres : ils appartiennent à un périmètre. */
  private get clePerimetre(): string {
    return `${this.bilan?.entityId ?? 'GROUPE'}|${this.bilan?.annee ?? 'TOUS'}`;
  }

  /**
   * Relit les paramètres du périmètre courant.
   *
   * <p>Ils sont rangés par périmètre : un statut de vérification ou un objectif
   * de réduction établi pour 2024 ne vaut pas d'office pour 2025, et le
   * reconduire en silence ferait signer une affirmation que personne n'a
   * revue.</p>
   */
  private relireParametres(): void {
    this.parametres = { ...parametresVides(), responsable: this.auteur };

    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const brut = localStorage.getItem(CLE_RAPPORT_NORME);
      const tous = brut ? JSON.parse(brut) : {};
      const retenus = tous?.[this.clePerimetre];
      if (retenus) this.parametres = { ...this.parametres, ...retenus };
    } catch {
      // Un stockage illisible ne doit pas priver le rapport de ses chapitres :
      // les textes par défaut prennent le relais.
    }

    // L'exercice précédent fait une année de référence acceptable par défaut :
    // c'est la comparaison que tout lecteur attend en premier.
    if (this.parametres.anneeReference === null && this.bilan?.annee != null) {
      this.parametres.anneeReference = this.bilan.annee - 1;
    }
  }

  /** Persiste les paramètres du périmètre courant. */
  private persisterParametres(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const brut = localStorage.getItem(CLE_RAPPORT_NORME);
      const tous = brut ? JSON.parse(brut) : {};
      tous[this.clePerimetre] = this.parametres;
      localStorage.setItem(CLE_RAPPORT_NORME, JSON.stringify(tous));
    } catch (erreur) {
      console.error('[reporting] Paramètres du rapport normé non persistés', erreur);
    }
  }

  /** Prend acte d'une saisie dans les champs chiffrés du rapport normé. */
  parametresModifies(): void {
    this.persisterParametres();
    this.cdr.markForCheck();
  }

  /** L'année de référence a changé : le bilan correspondant est rechargé. */
  anneeReferenceModifiee(): void {
    this.persisterParametres();
    const filtre = this.entityService.filter;
    this.chargerAnneeReference(filtre.entityId, filtre.usineId);
  }

  /**
   * Bascule d'un mode de consultation à l'autre.
   *
   * <p>Le bilan n'est pas rechargé : les deux modes lisent le même calcul, et
   * seule la mise en forme change. Le rendu est notifié explicitement —
   * l'application est sans zone, une simple affectation ne déclencherait
   * aucun cycle.</p>
   */
  changerMode(mode: ModeRapport): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.annulerBloc();
    this.cdr.markForCheck();
  }

  basculerChapitre(id: string): void {
    if (this.deplies.has(id)) this.deplies.delete(id);
    else this.deplies.add(id);
  }

  estDeplie(id: string): boolean {
    return this.deplies.has(id);
  }

  toutDeplier(): void {
    this.deplies = new Set(this.chapitres.map(chapitre => chapitre.id));
  }

  toutReplier(): void {
    this.deplies.clear();
  }

  /** Ouvre un chapitre depuis le sommaire et l'amène sous les yeux. */
  allerAuChapitre(chapitre: ChapitreNorme): void {
    this.deplies.add(chapitre.id);
    if (!isPlatformBrowser(this.platformId)) return;

    this.cdr.detectChanges();
    document.getElementById(`chapitre-${chapitre.id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Texte d'un bloc : celui du responsable RSE, à défaut celui dérivé du bilan. */
  texte(blocId: string): string {
    const saisi = this.parametres.textes[blocId];
    return saisi !== undefined && saisi !== '' ? saisi : this.textesParDefaut[blocId] ?? '';
  }

  /** Le bloc a-t-il été amendé par le responsable RSE ? */
  estAmende(blocId: string): boolean {
    const saisi = this.parametres.textes[blocId];
    return saisi !== undefined && saisi !== '' && saisi !== this.textesParDefaut[blocId];
  }

  modifierBloc(blocId: string): void {
    this.blocEnEdition = blocId;
    this.brouillon = this.texte(blocId);
  }

  enregistrerBloc(): void {
    if (!this.blocEnEdition) return;

    this.parametres.textes[this.blocEnEdition] = this.brouillon.trim();
    this.persisterParametres();
    this.blocEnEdition = null;
    this.brouillon = '';
    this.cdr.markForCheck();
  }

  annulerBloc(): void {
    this.blocEnEdition = null;
    this.brouillon = '';
  }

  /** Rend au bloc le texte dérivé du bilan. */
  reinitialiserBloc(blocId: string): void {
    delete this.parametres.textes[blocId];
    this.persisterParametres();
    this.blocEnEdition = null;
    this.cdr.markForCheck();
  }

  // ---------- SOLUTIONS ET RECOMMANDATIONS RSE ----------

  /**
   * Solutions du périmètre, dans l'ordre où le rapport les présente.
   *
   * <p>Un tableau est rendu même quand les paramètres n'en portent pas : des
   * paramètres relus d'un stockage écrit avant ce chapitre n'ont pas le champ,
   * et le gabarit itérerait sur {@code undefined}.</p>
   */
  get solutions(): SolutionRSE[] {
    return this.parametres.solutions ?? [];
  }

  /** Solution en cours de saisie ; `null` quand aucune ne l'est. */
  solutionEnEdition: string | null = null;

  /** Brouillon de la solution éditée, abandonné si la saisie est annulée. */
  brouillonSolution: { titre: string; texte: string } = { titre: '', texte: '' };

  /**
   * Numérote une solution pour le sommaire et le document — « 11.2 ».
   *
   * <p>Le numéro se déduit du rang, jamais de l'identifiant : retirer la
   * première solution doit renuméroter les suivantes, sans quoi le sommaire
   * afficherait un trou.</p>
   */
  numeroSolution(index: number): string {
    const chapitre = this.chapitres.find(c => c.gabarit === 'solutions');
    return `${chapitre?.numero ?? ''}.${index + 1}`;
  }

  /**
   * Identifiant libre pour une nouvelle solution.
   *
   * <p>Dérivé du plus grand rang déjà pris, et non du nombre de solutions : en
   * supprimer une du milieu puis en ajouter une autre redonnerait sinon un
   * identifiant encore porté par une solution vivante, et les deux se
   * confondraient à l'édition.</p>
   */
  private identifiantLibre(): string {
    const rangs = this.solutions
      .map(solution => Number(/^sol-(\d+)$/.exec(solution.id)?.[1]))
      .filter(rang => Number.isFinite(rang));

    return `sol-${(rangs.length ? Math.max(...rangs) : 0) + 1}`;
  }

  /** Ajoute une solution vide et l'ouvre aussitôt en saisie. */
  ajouterSolution(): void {
    const solution: SolutionRSE = { id: this.identifiantLibre(), titre: '', texte: '' };

    this.parametres.solutions = [...this.solutions, solution];
    this.solutionEnEdition = solution.id;
    this.brouillonSolution = { titre: '', texte: '' };
    this.cdr.markForCheck();
  }

  modifierSolution(solution: SolutionRSE): void {
    this.solutionEnEdition = solution.id;
    this.brouillonSolution = { titre: solution.titre, texte: solution.texte };
  }

  /**
   * Valide la saisie en cours.
   *
   * <p>Une solution sans titre est retirée plutôt qu'enregistrée : elle
   * paraîtrait au sommaire sous une ligne vide, impossible à retrouver dans le
   * document. C'est aussi ce qui annule proprement un ajout auquel on
   * renonce.</p>
   */
  enregistrerSolution(): void {
    if (!this.solutionEnEdition) return;

    const titre = this.brouillonSolution.titre.trim();
    const texte = this.brouillonSolution.texte.trim();

    this.parametres.solutions = titre
      ? this.solutions.map(solution =>
          solution.id === this.solutionEnEdition ? { ...solution, titre, texte } : solution)
      : this.solutions.filter(solution => solution.id !== this.solutionEnEdition);

    this.persisterParametres();
    this.annulerSolution();
    this.cdr.markForCheck();
  }

  /**
   * Abandonne la saisie en cours.
   *
   * <p>Une solution jamais titrée disparaît avec elle : c'est un ajout auquel
   * on a renoncé, et le laisser en place encombrerait le chapitre d'une entrée
   * vide.</p>
   */
  annulerSolution(): void {
    this.parametres.solutions = this.solutions.filter(
      solution => solution.titre.trim() !== '' || solution.id !== this.solutionEnEdition);

    this.solutionEnEdition = null;
    this.brouillonSolution = { titre: '', texte: '' };
    this.cdr.markForCheck();
  }

  supprimerSolution(solution: SolutionRSE): void {
    this.parametres.solutions = this.solutions.filter(autre => autre.id !== solution.id);
    this.persisterParametres();

    if (this.solutionEnEdition === solution.id) this.solutionEnEdition = null;
    this.cdr.markForCheck();
  }

  /**
   * Déplace une solution d'un rang.
   *
   * <p>L'ordre est celui de lecture du plan d'action : une mesure prioritaire
   * doit pouvoir remonter sans être ressaisie.</p>
   */
  deplacerSolution(index: number, sens: -1 | 1): void {
    const cible = index + sens;
    const solutions = [...this.solutions];
    if (cible < 0 || cible >= solutions.length) return;

    [solutions[index], solutions[cible]] = [solutions[cible], solutions[index]];

    this.parametres.solutions = solutions;
    this.persisterParametres();
    this.cdr.markForCheck();
  }

  /** Ouvre le chapitre des solutions et amène l'une d'elles sous les yeux. */
  allerALaSolution(solution: SolutionRSE): void {
    this.deplies.add('solutions');
    if (!isPlatformBrowser(this.platformId)) return;

    this.cdr.detectChanges();
    document.getElementById(`solution-${solution.id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Textes dérivés du bilan, recalculés à chaque rendu du chapitre. */
  private get textesParDefaut(): Record<string, string> {
    const bilan = this.bilan;
    if (!bilan) return {};

    return textesParDefaut({
      societe: bilan.libelleSociete,
      exercice: bilan.libelleExercice,
      totalT: this.tonnes(bilan.totalKg),
      scope1T: this.tonnes(bilan.scope1Kg),
      scope2T: this.tonnes(bilan.scope2Kg),
      scope3T: this.tonnes(bilan.scope3Kg),
      postesCollectes: bilan.postes.filter(poste => poste.emissionKg > 0).length,
      postesTotal: bilan.postes.length,
      mesures: bilan.mesures,
      serveurJoignable: bilan.serveurJoignable
    });
  }

  // ---------- CHAPITRE 4 : ANNÉE DE RÉFÉRENCE ----------

  /** Écart entre l'exercice consulté et l'année de référence retenue. */
  get ecartReference(): { totalKg: number; deltaKg: number; deltaPct: number | null } | null {
    const reference = this.bilanReference;
    if (!reference || !this.bilan || reference.totalKg <= 0) return null;

    const deltaKg = this.bilan.totalKg - reference.totalKg;
    return {
      totalKg: reference.totalKg,
      deltaKg,
      deltaPct: (deltaKg / reference.totalKg) * 100
    };
  }

  // ---------- CHAPITRE 8 : OBJECTIFS ----------

  /**
   * Empreinte visée à l'année cible, et écart restant à combler.
   *
   * <p>La cible s'applique à l'empreinte de l'année de référence, comme le veut
   * le GHG Protocol : l'asseoir sur l'exercice courant ferait glisser
   * l'objectif d'année en année.</p>
   */
  get objectif(): { baseKg: number; cibleKg: number; resteKg: number; atteint: boolean } | null {
    const pct = this.parametres.objectifPct;
    if (pct === null || !Number.isFinite(pct) || !this.bilan) return null;

    const baseKg = this.bilanReference?.totalKg ?? this.bilan.totalKg;
    if (baseKg <= 0) return null;

    const cibleKg = baseKg * (1 - pct / 100);
    const resteKg = this.bilan.totalKg - cibleKg;

    return { baseKg, cibleKg, resteKg, atteint: resteKg <= 0 };
  }

  // ---------- CHAPITRE 9 : RATIOS D'INTENSITÉ ----------

  /**
   * Ratios d'intensité du périmètre.
   *
   * <p>Aucun dénominateur n'est deviné : un ratio dont la production ou le
   * chiffre d'affaires n'a pas été saisi est rendu vide, avec la mention de ce
   * qui manque. Inventer le dénominateur produirait un indicateur faux dans un
   * document destiné à être audité.</p>
   */
  get ratios(): RatioIntensite[] {
    const totalT = (this.bilan?.totalKg ?? 0) / 1000;
    const devise = this.bilan?.devise ?? 'TND';
    const { chiffreAffairesM, production, effectif } = this.activite;

    const construire = (libelle: string, denominateur: number | null,
                        unite: string, quoi: string): RatioIntensite => ({
      libelle,
      valeur: denominateur && denominateur > 0 ? totalT / denominateur : null,
      unite,
      manque: `Renseignez ${quoi} dans l'écran « Données d'Activité & KPI »`
    });

    return [
      construire('Intensité par pièce produite', production,
        'tCO₂e / unité', "la production de l'exercice"),
      construire(`Intensité par million de ${devise}`, chiffreAffairesM,
        `tCO₂e / M ${devise}`, "le chiffre d'affaires de l'exercice"),
      construire('Intensité par salarié', effectif,
        'tCO₂e / salarié', "l'effectif de l'exercice")
    ];
  }

  /** Un ratio par pièce se lit mieux en grammes qu'en tonnes. */
  formaterRatio(ratio: RatioIntensite): string {
    if (ratio.valeur === null) return '—';
    if (ratio.valeur < 0.001) return `${this.formater(ratio.valeur * 1_000_000, 2)} g`;
    if (ratio.valeur < 1) return `${this.formater(ratio.valeur * 1000, 2)} kg`;
    return this.formater(ratio.valeur, 3);
  }

  formaterUniteRatio(ratio: RatioIntensite): string {
    if (ratio.valeur === null) return '';
    if (ratio.valeur < 1) return ratio.unite.replace('tCO₂e', 'CO₂e');
    return ratio.unite;
  }

  // ---------- MISE EN FORME ----------

  /**
   * Date d'impression en toutes lettres.
   *
   * <p>Le formatage passe par {@code toLocaleDateString} et non par le pipe
   * {@code date} : celui-ci exige que les données de la locale française aient
   * été enregistrées au démarrage, faute de quoi il lève une exception qui
   * viderait le rapport. {@code Intl} n'a pas cette contrainte, et c'est déjà
   * la façon de faire du tableau de bord.</p>
   */
  get dateImpressionLongue(): string {
    return this.dateImpression.toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
  }

  /** Date d'impression au format `JJ/MM/AAAA`. */
  get dateImpressionCourte(): string {
    return this.dateImpression.toLocaleDateString('fr-FR');
  }

  formater(valeur: number, decimales = 2): string {
    if (!Number.isFinite(valeur)) return '—';
    return valeur.toLocaleString('fr-FR', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales
    });
  }

  /** Valeur en tonnes de CO₂ équivalent, unité de restitution du rapport. */
  tonnes(kg: number, decimales = 2): string {
    return this.formater(kg / 1000, decimales);
  }

  /** Origines d'un poste, rendues en une seule mention. */
  origines(poste: PosteBilan): string {
    if (!poste.origines.length) return poste.collecte ? 'Collecte à lancer' : 'Poste non collecté';
    return poste.origines.join(' + ');
  }

  // ---------- EXPORT ----------

  /**
   * Ouvre la boîte d'impression du navigateur sur le seul rapport.
   *
   * <p>Le corps du document porte une classe le temps de l'impression : la
   * feuille de style globale s'en sert pour effacer la navigation, l'en-tête et
   * le panneau de configuration, qui n'ont rien à faire dans un document
   * transmis en comité.</p>
   */
  /**
   * Télécharge le rapport en PDF.
   *
   * <p>Aucune librairie de rendu n'est employée : la boîte d'impression du
   * navigateur propose « Enregistrer au format PDF », et la feuille de style
   * {@code @media print} pagine le document. Un rendu par capture d'image
   * (html2canvas) produirait des pages en bitmap — texte non sélectionnable, ni
   * indexable, ni accessible — pour un document destiné à être archivé.</p>
   *
   * <p>Le titre du document commande le nom du fichier proposé : il porte donc
   * le pays et l'exercice consultés, pour qu'un rapport téléchargé se
   * reconnaisse sans l'ouvrir. Il est rétabli après l'impression.</p>
   */
  exporterPDF(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const titreInitial = document.title;

    // Le nom du fichier suit la langue du document : un rapport remis en
    // anglais ne doit pas arriver sous un nom français.
    const pays = (this.filtres.paysActif()?.nom ?? (this.langue() === 'EN' ? 'Group' : 'Groupe'))
      .replace(/\s+/g, '-');
    document.title = `${this.t('pdf.nom')}_${pays}_${this.filtres.libelleExercice()}`;

    window.addEventListener('afterprint',
      () => { document.title = titreInitial; }, { once: true });

    try {
      this.imprimer();
    } finally {
      document.title = titreInitial;
    }
  }

  imprimer(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.dateImpression = new Date();

    // Le rapport normé s'imprime en entier : un chapitre replié à l'écran est
    // un confort de lecture, pas une omission voulue dans le document remis.
    if (this.mode === 'norme') {
      this.toutDeplier();
      this.annulerBloc();
    }

    this.cdr.detectChanges();

    const corps = document.body;
    corps.classList.add('impression-rapport');

    const nettoyer = () => corps.classList.remove('impression-rapport');
    window.addEventListener('afterprint', nettoyer, { once: true });

    try {
      window.print();
    } finally {
      // `print()` rend la main dès la fermeture de la boîte sur la plupart des
      // navigateurs ; `afterprint` couvre ceux qui la rendent plus tôt.
      nettoyer();
    }
  }
}
