import { Inject, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, map } from 'rxjs';

import { ReferentialService, FacteurDetaille } from '../../services/referential.service';
import { LigneDispatchee } from './dispatch-excel';
import { EcranDestination } from './regles-dispatch';
import { referenceDepuisLibelle } from '../../core/traduction-libelles';
import { TauxChangeService } from '../../core/taux-change.service';

/**
 * État partagé des lignes comptables ventilées.
 *
 * <p>Chaque écran de catégorie s'y abonne : une importation globale alimente
 * ainsi toutes les catégories d'un coup, sans que l'utilisateur ait à déposer
 * le même classeur dix fois.</p>
 */

/**
 * Prix moyen du kilowattheure MISFAT, en dinars.
 *
 * <p>Relevé du suivi d'indicateurs 2025 : il convertit une facture STEG en
 * kilowattheures, faute de compteur dans la balance générale.</p>
 */
export const PRIX_KWH_TND = 0.291;

/** Facteur de l'électricité tunisienne, en kgCO₂e par kilowattheure. */
export const FACTEUR_ELECTRICITE_KWH = 0.420;

/**
 * Facteurs monétaires de repli, en kgCO₂e par dinar dépensé.
 *
 * <p>Approche « spend-based » : elle vaut ce que vaut un ratio moyen, et
 * n'existe que pour empêcher qu'un poste ne pèse zéro faute de facteur. Leur
 * origine est toujours restituée à l'écran.</p>
 */
export const REPLIS_MONETAIRES: Record<EcranDestination, number> = {
  // Facture STEG ramenée au kilowattheure, puis valorisée : 0,420 / 0,291.
  'electricite-achetee': FACTEUR_ELECTRICITE_KWH / PRIX_KWH_TND,
  'emissions-refrigerants': 1.200,
  'combustion-etablissements': 0.450,
  'combustion-vehicules': 0.420,
  'transport-amont': 0.350,
  'transport-aval': 0.350,
  'voyages-affaires': 0.300,
  'biens-services': 0.250,
  'investissements': 0.250,
  'dechets': 0.200
};

/**
 * Référence du référentiel qui documente le facteur de chaque destination.
 *
 * <p>Deux raisons d'exister. D'abord, une destination dont le référentiel ne
 * documente aucun facteur monétaire — la combustion, l'électricité, les
 * réfrigérants n'en ont que des facteurs physiques, au litre ou au
 * kilowattheure — se voyait appliquer un ratio anonyme, et sa colonne
 * « Référence carbone » restait vide. Ensuite, une destination qui en documente
 * plusieurs dizaines — la catégorie 1 en compte trente-huit — en retenait un par
 * année de référence, donc à peu près au hasard : un achat de matières premières
 * pouvait être valorisé par le facteur du cuivre laminé.</p>
 *
 * <p>Nommer la référence ici rend le choix explicite et discutable. Aucune
 * n'est devinée : chacune est un code que la base porte réellement, et le
 * commentaire dit ce qu'elle documente.</p>
 */
export const REFERENCES_VENTILATION: Partial<Record<EcranDestination, string>> = {
  // Média filtrant : l'activité de MISFAT est la filtration, et ses achats de
  // matières premières sont d'abord du papier transformé. 0,1011 kgCO₂e/TND.
  'biens-services': 'MS3C1CP'
};

/**
 * Ratios monétaires obtenus en divisant un facteur physique par un prix.
 *
 * <p>Le référentiel ne documente aucun facteur monétaire pour l'électricité : il
 * la documente au kilowattheure. Le ratio par dinar s'en déduit, à condition de
 * connaître le prix du kilowattheure — et c'est cette division, et elle seule,
 * qui autorise à nommer la référence source dans la colonne du référentiel.</p>
 *
 * <p>La ligne reste marquée comme approximation : diviser par un prix moyen ne
 * transforme pas un ratio en relevé. Mais un vérificateur peut désormais
 * remonter au facteur employé, ce qu'un tiret lui interdisait.</p>
 */
export const DERIVATIONS_MONETAIRES: Partial<Record<EcranDestination, {
  /** Référence physique dont le ratio est déduit. */
  code: string;
  /** Prix unitaire retenu, dans l'unité du facteur. */
  prix: number;
  /** Ce que le prix mesure, pour que la division reste lisible. */
  uniteePrix: string;
}>> = {
  'electricite-achetee': { code: 'MS2ENEC', prix: PRIX_KWH_TND, uniteePrix: 'TND/kWh' }
};

/** Catégorie du référentiel MS SQL interrogée pour chaque destination. */
const MOTIFS_CATEGORIE: Record<EcranDestination, RegExp> = {
  'combustion-etablissements': /stationary|combustion|fuel/i,
  'combustion-vehicules': /mobile|vehicle|fleet/i,
  'emissions-refrigerants': /refrigerant|fugitive/i,
  'electricite-achetee': /electricity|purchased energy|scope 2/i,
  'biens-services': /Category 1\b/i,
  'transport-amont': /Category 4\b/i,
  'dechets': /Category 5\b/i,
  'voyages-affaires': /Category 6\b/i,
  'transport-aval': /Category 9\b/i,
  'investissements': /Category 15\b/i
};

export type OrigineFacteur = 'MS SQL BDD' | 'ADEME Fallback';

/** Ligne ventilée, valorisée par son facteur d'émission. */
export interface LigneValorisee extends LigneDispatchee {
  facteur: number;
  uniteFacteur: string;
  libelleFacteur: string;
  baseAppliquee: string;
  origineFacteur: OrigineFacteur;
  emissionKg: number;
  /**
   * Code du référentiel carbone qui a désigné le facteur.
   *
   * <p>Distinct de {@link LigneDispatchee.mainAccount}, le compte comptable, et
   * de {@link LigneDispatchee.reference}, la référence du document source. Les
   * trois cohabitaient sous un seul nom, et c'est le compte qui gagnait.</p>
   */
  referenceCarbone: string;
}

export interface EtatDispatch {
  lignes: LigneValorisee[];
  fichier: string;
  importeLe: string;
  /** Écartées du bilan à dessein. */
  exclues: number;
  /** Lues, mais qu'aucune règle n'a su rattacher. */
  nonVentilees: number;
  /**
   * Exercice auquel la répartition se rattache.
   *
   * <p>Une balance générale solde un exercice et un seul : ses lignes ne
   * doivent remonter que sur l'année qu'elles documentent.</p>
   */
  exercice: number | null;
  /** Société à laquelle la répartition se rattache, ou toutes si nulle. */
  entityId: number | null;
}

const ETAT_VIDE: EtatDispatch = {
  lignes: [], fichier: '', importeLe: '', exclues: 0, nonVentilees: 0,
  exercice: null, entityId: null
};

/** Aucune ligne active : référence stable, pour ne pas invalider les mémoires. */
const AUCUNE_LIGNE: LigneValorisee[] = [];

/** Exercice deviné du nom du classeur, à défaut de choix explicite. */
export function exerciceDepuisNom(nom: string): number | null {
  const trouve = String(nom ?? '').match(/(20\d{2})/);
  if (!trouve) return null;
  const annee = Number(trouve[1]);
  return annee >= 2000 && annee <= 2100 ? annee : null;
}

/** Clé de persistance de la répartition, relue à chaque démarrage. */
export const CLE_STOCKAGE = 'misfat_dispatched_lines';

/** Ancienne clé, relue une dernière fois puis effacée. */
const CLE_HERITEE = 'repartitionGlobaleMisfat';

@Injectable({ providedIn: 'root' })
export class DispatchStore {

  /** Cours de change partagés : ils ramènent les facteurs étrangers au dinar. */
  private readonly tauxChange = inject(TauxChangeService);

  private readonly etat = new BehaviorSubject<EtatDispatch>(ETAT_VIDE);

  /** Référentiel complet, chargé une fois puis filtré localement. */
  private facteurs: FacteurDetaille[] = [];
  private facteursCharges = false;

  /** Limite de stockage atteinte : restitué à l'écran d'import. */
  avertissementPersistance = '';

  constructor(
    private referentialService: ReferentialService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.relire();
  }

  /** Flux complet, tel qu'il alimente l'écran de répartition. */
  get etat$(): Observable<EtatDispatch> { return this.etat.asObservable(); }

  get instantane(): EtatDispatch { return this.etat.value; }

  /** Exercice et société consultés, suivis depuis le contexte global. */
  private exerciceActif: number | null = null;
  private entiteActive: number | null = null;

  /**
   * La répartition relève-t-elle du périmètre consulté ?
   *
   * <p>L'étanchéité est stricte, sur les deux axes : une balance qui solde
   * l'exercice 2025 ne pèse rien sur le bilan 2024, et deux sociétés ne
   * partagent pas leurs émissions. Le millésime et la société de la répartition
   * sont rappelés dans le bandeau de chaque écran, pour qu'un écran resté vide
   * s'explique de lui-même.</p>
   *
   * <p>Un exercice ou une société non renseignés — côté périmètre comme côté
   * répartition — valent « tous » : c'est la vue consolidée, explicitement
   * demandée, et non un relâchement de la règle.</p>
   */
  concernePerimetre(exercice: number | null, entityId: number | null): boolean {
    const etat = this.etat.value;

    if (entityId !== null && etat.entityId !== null && etat.entityId !== entityId) return false;
    if (exercice !== null && etat.exercice !== null && etat.exercice !== exercice) return false;

    return true;
  }

  /**
   * Lignes relevant d'un périmètre donné, sans toucher au périmètre suivi.
   *
   * <p>Le rapport et le tableau de bord interrogent le même magasin ; une
   * lecture ne doit pas déplacer le périmètre que l'autre observe.</p>
   */
  lignesPour(exercice: number | null, entityId: number | null): LigneValorisee[] {
    return this.concernePerimetre(exercice, entityId) ? this.etat.value.lignes : AUCUNE_LIGNE;
  }

  /**
   * Répartition active.
   *
   * <p>Le périmètre n'est suivi que par les écrans qui le connaissent — le
   * tableau de bord, le rapport et l'import. Tant qu'aucun n'a été fixé, la
   * répartition est rendue en entier : la masquer avant même de savoir ce qui
   * est consulté n'apprendrait rien. Dès qu'un périmètre est connu, le
   * cloisonnement s'applique sans indulgence sur les deux axes.</p>
   */
  get lignesActives(): LigneValorisee[] {
    if (this.exerciceActif === null && this.entiteActive === null) {
      return this.etat.value.lignes;
    }

    return this.concernePerimetre(this.exerciceActif, this.entiteActive)
      ? this.etat.value.lignes
      : AUCUNE_LIGNE;
  }

  /** Prend acte du périmètre consulté et rediffuse la répartition. */
  suivrePerimetre(exercice: number | null, entityId: number | null): void {
    if (exercice === this.exerciceActif && entityId === this.entiteActive) return;
    this.exerciceActif = exercice;
    this.entiteActive = entityId;
    // Même état, nouvelle diffusion : les abonnés refiltrent sur le périmètre.
    this.etat.next({ ...this.etat.value });
  }

  /** Lignes ventilées vers un écran donné, rafraîchies à chaque import. */
  pour(ecran: EcranDestination): Observable<LigneValorisee[]> {
    return this.etat.pipe(map(() => this.lignesActives.filter(l => l.ecran === ecran)));
  }

  /** Total des émissions ventilées vers un écran, en kgCO₂e. */
  totalPour(ecran: EcranDestination): number {
    return this.lignesActives
      .filter(l => l.ecran === ecran)
      .reduce((somme, l) => somme + l.emissionKg, 0);
  }

  /** Total des émissions ventilées vers un scope, en kgCO₂e. */
  totalPourScope(scope: 'SCOPE_1' | 'SCOPE_2' | 'SCOPE_3'): number {
    return this.lignesActives
      .filter(l => l.scope === scope)
      .reduce((somme, l) => somme + l.emissionKg, 0);
  }

  /**
   * Charge le référentiel MS SQL, une fois pour toutes les destinations.
   *
   * <p>Un seul appel : le service filtre côté client, dix appels successifs
   * ramèneraient dix fois le même corps de réponse.</p>
   */
  chargerFacteurs(): Observable<FacteurDetaille[]> {
    return new Observable<FacteurDetaille[]>(observateur => {
      if (this.facteursCharges) {
        observateur.next(this.facteurs);
        observateur.complete();
        return;
      }

      this.referentialService.getFactorsByCategory(/./).subscribe({
        next: facteurs => {
          this.facteurs = Array.isArray(facteurs) ? facteurs : [];
          this.facteursCharges = true;
          observateur.next(this.facteurs);
          observateur.complete();
        },
        // Le référentiel injoignable ne bloque pas l'import : les replis
        // ADEME prennent le relais, et leur origine est affichée.
        error: () => {
          this.facteurs = [];
          this.facteursCharges = true;
          observateur.next([]);
          observateur.complete();
        }
      });
    });
  }

  /**
   * Retient le facteur d'une destination : MS SQL d'abord, repli ADEME ensuite.
   *
   * <p>Seuls les facteurs monétaires sont éligibles : les lignes ventilées
   * portent des montants en dinars, pas des kilowattheures.</p>
   */
  facteurPour(ecran: EcranDestination): {
    valeur: number; origine: OrigineFacteur; libelle: string; base: string; unite: string;
    /**
     * Code du référentiel qui a désigné ce facteur.
     *
     * <p>Il était perdu ici, et les écrans affichaient alors le compte comptable
     * — 601000, 625000 — dans la colonne « Référence carbone ». Un compte
     * identifie une écriture, pas un facteur d'émission : les confondre ôte au
     * rapport toute traçabilité du calcul.</p>
     *
     * <p>Vide sur un repli, à dessein : un ratio moyen n'a pas de référence, et
     * lui en inventer une la rendrait indiscernable d'une valeur documentée.</p>
     */
    reference: string;
  } {
    const motif = MOTIFS_CATEGORIE[ecran];

    // Une référence nommée pour cette destination prime sur le tri par année :
    // choisir un facteur parmi trente-huit au millésime le plus récent n'est pas
    // un choix, c'est un hasard.
    const codeVoulu = REFERENCES_VENTILATION[ecran];
    const designe = codeVoulu
      ? this.facteurs.find(f =>
          (f.referenceCode ?? '').trim().toUpperCase() === codeVoulu
          && (f.dataType ?? '').toUpperCase() === 'MONETAIRE')
      : undefined;

    if (designe) {
      return {
        valeur: designe.factorValue,
        origine: 'MS SQL BDD',
        libelle: designe.typeName,
        base: designe.databaseSource || 'MS SQL BDD',
        unite: designe.currency?.trim() || designe.unit || 'TND',
        reference: designe.referenceCode ?? ''
      };
    }

    // Ratio déduit d'un facteur physique : la référence source est nommée, mais
    // l'origine reste celle d'une approximation — diviser par un prix moyen ne
    // fait pas d'un ratio un relevé.
    const derivation = DERIVATIONS_MONETAIRES[ecran];
    if (derivation && derivation.prix > 0) {
      const source = this.facteurs.find(f =>
        (f.referenceCode ?? '').trim().toUpperCase() === derivation.code);

      if (source) {
        const ratio = source.factorValue / derivation.prix;
        return {
          valeur: ratio,
          origine: 'ADEME Fallback',
          libelle: `${source.typeName} — ratio déduit : ${source.factorValue.toFixed(4)} `
            + `÷ ${derivation.prix} ${derivation.uniteePrix}`,
          base: source.databaseSource || 'MS SQL BDD',
          unite: 'TND',
          reference: source.referenceCode ?? ''
        };
      }
    }

    const retenu = this.facteurs
      .filter(f => (f.dataType ?? '').toUpperCase() === 'MONETAIRE')
      .filter(f => motif.test(f.categoryName ?? ''))
      .sort((a, b) => (b.referenceYear ?? 0) - (a.referenceYear ?? 0))[0];

    if (retenu) {
      return {
        valeur: retenu.factorValue,
        origine: 'MS SQL BDD',
        libelle: retenu.typeName,
        base: retenu.databaseSource || 'MS SQL BDD',
        unite: retenu.currency?.trim() || retenu.unit || 'TND',
        reference: retenu.referenceCode ?? ''
      };
    }

    return {
      valeur: REPLIS_MONETAIRES[ecran],
      origine: 'ADEME Fallback',
      libelle: 'Ratio monétaire moyen (approche spend-based)',
      base: 'ADEME Fallback',
      unite: 'TND',
      reference: ''
    };
  }

  /**
   * Les achats monétaires quittent-ils le Scope 1 à l'import ?
   *
   * <p>Non : le routage d'origine est rétabli. Une ligne de gazole part sur
   * l'écran que ses règles désignent, et n'est comptée qu'une fois — chaque
   * ligne ventilée porte une destination et une seule, ce qui exclut qu'elle
   * pèse à la fois au Scope 1 et dans les achats.</p>
   *
   * <p>La constante subsiste pour que le choix reste nommé plutôt que
   * simplement absent : au sens du GHG Protocol, brûler un carburant que l'on
   * possède est une émission directe, quelle que soit la donnée d'activité.</p>
   */
  static readonly RECLASSER_MONETAIRE_SCOPE_1 = false;

  /**
   * Facteur désigné par le libellé français de la ligne.
   *
   * <p>« Achats matières combustibles Gasoil » ne ressemble à aucun type du
   * référentiel, rédigé en anglais. La table de traduction fait le pont et
   * désigne « market for diesel » — un facteur propre à cette ligne, là où la
   * règle par destination applique le même à tout un poste.</p>
   *
   * <p>Seuls les facteurs monétaires sont retenus : la ligne porte des dinars,
   * et un facteur au litre ne s'y applique pas.</p>
   */
  private facteurDepuisLibelle(libelle: string): {
    valeur: number; origine: OrigineFacteur; libelle: string; base: string;
    unite: string; reference: string;
  } | null {

    const code = referenceDepuisLibelle(libelle);
    if (!code) return null;

    const trouve = this.facteurs.find(f =>
      (f.referenceCode ?? '').trim().toUpperCase() === code
      && (f.dataType ?? '').toUpperCase() === 'MONETAIRE');

    if (!trouve) return null;

    return {
      valeur: trouve.factorValue,
      origine: 'MS SQL BDD',
      libelle: trouve.typeName,
      base: trouve.databaseSource || 'MS SQL BDD',
      unite: trouve.currency?.trim() || trouve.unit || 'TND',
      reference: trouve.referenceCode ?? ''
    };
  }


  /** Valorise des lignes ventilées, sans les publier. */
  valoriser(lignes: LigneDispatchee[]): LigneValorisee[] {
    return lignes.map(ligneRecue => {
      const ligne = ligneRecue;

      if (!ligne.ecran) {
        return {
          ...ligne, facteur: 0, uniteFacteur: 'TND', libelleFacteur: '',
          baseAppliquee: '', origineFacteur: 'ADEME Fallback' as OrigineFacteur, emissionKg: 0,
          referenceCarbone: ''
        };
      }

      // Le libellé du classeur est français, le référentiel anglais : la table
      // de traduction est consultée avant la règle par destination, car elle
      // désigne un facteur propre à la ligne quand la destination n'en connaît
      // qu'un pour tout un poste.
      const parLibelle = this.facteurDepuisLibelle(ligne.nom);
      const facteur = parLibelle ?? this.facteurPour(ligne.ecran);

      // Les montants ventilés sont en dinars ; un facteur libellé en euros ou
      // en dollars s'y appliquerait sans commune mesure. Il est ramené au dinar
      // au cours de l'exercice de la dépense — jamais au cours du jour, qui
      // ferait bouger les émissions d'un exercice déjà clos.
      const ramene = this.tauxChange.facteurEnDinars(
        facteur.valeur, facteur.unite, this.exerciceActif);

      const emission = ligne.quantite * ramene.facteur;

      return {
        ...ligne,
        facteur: ramene.facteur,
        uniteFacteur: ramene.converti ? 'TND' : facteur.unite,
        libelleFacteur: ramene.converti
          ? `${facteur.libelle} — converti au cours ${ramene.cours} TND/${facteur.unite}`
          : facteur.libelle,
        baseAppliquee: facteur.base,
        origineFacteur: facteur.origine,
        emissionKg: Number.isFinite(emission) ? emission : 0,
        referenceCarbone: facteur.reference
      };
    });
  }

  /**
   * Publie une nouvelle répartition.
   *
   * <p>Elle remplace la précédente : réimporter le même classeur ne doit pas
   * doubler les émissions du bilan.</p>
   */
  publier(etat: Omit<EtatDispatch, 'lignes'> & { lignes: LigneValorisee[] }): void {
    this.etat.next({ ...etat });
    this.persister();
  }

  /**
   * Reprend le facteur de lignes ventilées désignées par leur clé.
   *
   * <p>Une reprise en masse portait jusqu'ici sur les seules lignes saisies :
   * celles issues de la balance gardaient leur facteur, si bien qu'une
   * catégorie corrigée restait à moitié à l'ancienne valeur, et le total ne
   * bougeait pas comme l'utilisateur l'attendait.</p>
   *
   * <p>La correction vit dans le magasin, non dans l'écran : c'est lui qui
   * détient ces lignes, et lui seul peut les republier à tous les abonnés — le
   * tableau, les indicateurs et le bilan se mettent alors à jour ensemble.</p>
   *
   * <p>Elle est écrasée au prochain import du classeur, comme toute valeur
   * portée par la répartition : la reprise vaut pour la répartition en cours.</p>
   *
   * @returns le nombre de lignes effectivement reprises.
   */
  reprendreFacteur(cles: readonly string[], facteur: number, base?: string): number {
    if (!Array.isArray(cles) || !cles.length) return 0;
    if (!Number.isFinite(facteur) || facteur <= 0) return 0;

    const cibles = new Set(cles);
    let reprises = 0;

    const lignes = this.etat.value.lignes.map(ligne => {
      if (!cibles.has(ligne.cle)) return ligne;
      if (Math.abs(ligne.facteur - facteur) < 1e-9) return ligne;

      reprises++;
      const emission = ligne.quantite * facteur;

      return {
        ...ligne,
        facteur,
        emissionKg: Number.isFinite(emission) ? emission : ligne.emissionKg,
        baseAppliquee: base ?? 'Saisie manuelle (reprise en masse)',
        origineFacteur: 'ADEME Fallback' as OrigineFacteur
      };
    });

    if (!reprises) return 0;

    this.etat.next({ ...this.etat.value, lignes });
    this.persister();
    return reprises;
  }

  /**
   * Renseigne la catégorie carbone d'une ligne, et la revalorise.
   *
   * <p>Une ligne dont le classeur ne portait pas de catégorie est valorisée par
   * le libellé de son compte, faute de mieux. Lui donner sa catégorie ne suffit
   * pas : il faut rejouer la valorisation, sans quoi le facteur resterait celui
   * du repli et la correction n'aurait aucun effet sur le bilan.</p>
   *
   * <p>La ligne cesse alors d'être comptée parmi les « sans catégorie » : c'est
   * ce qui fait décroître l'avertissement à mesure qu'on la corrige.</p>
   *
   * @returns vrai si la ligne a été retrouvée et corrigée.
   */
  corrigerCategorie(cle: string, categorie: string): boolean {
    const libelle = String(categorie ?? '').trim();
    if (!cle || !libelle) return false;

    const etat = this.etat.value;
    const cible = etat.lignes.find(ligne => ligne.cle === cle);
    if (!cible) return false;

    const corrigee: LigneDispatchee = {
      ...cible,
      categorieCarboneTexte: libelle,
      categorieAbsente: false
    };

    const [revalorisee] = this.valoriser([corrigee]);
    const lignes = etat.lignes.map(ligne => (ligne.cle === cle ? revalorisee : ligne));

    this.etat.next({ ...etat, lignes });
    this.persister();
    return true;
  }

  /**
   * Retire des lignes de la répartition, par leur clé.
   *
   * <p>Une ligne écartée depuis le détail d'un import doit disparaître partout
   * à la fois : de la grille de son écran, des indicateurs et du bilan. Le
   * magasin la retire et republie, ce qu'aucun écran ne pourrait faire seul.</p>
   *
   * <p>Le compte des lignes non ventilées suit : la ligne n'est pas devenue
   * inclassable, elle a été jugée hors périmètre.</p>
   *
   * @returns le nombre de lignes effectivement retirées.
   */
  supprimerLignes(cles: readonly string[]): number {
    if (!Array.isArray(cles) || !cles.length) return 0;

    const cibles = new Set(cles);
    const etat = this.etat.value;
    const restantes = etat.lignes.filter(ligne => !cibles.has(ligne.cle));

    const retirees = etat.lignes.length - restantes.length;
    if (!retirees) return 0;

    this.etat.next({ ...etat, lignes: restantes, exclues: etat.exclues + retirees });
    this.persister();
    return retirees;
  }

  vider(): void {
    this.etat.next(ETAT_VIDE);
    this.avertissementPersistance = '';
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(CLE_STOCKAGE);
      localStorage.removeItem(CLE_HERITEE);
    }
  }

  /**
   * Persiste la répartition, en cédant du terrain plutôt que tout perdre.
   *
   * <p>Une base d'immobilisations de 2 000 lignes dépasse le quota du
   * navigateur. Plutôt que d'abandonner, on retente avec les seules lignes
   * ventilées — celles dont les écrans ont besoin —, puis on le dit.</p>
   */
  private persister(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const etat = this.etat.value;

    if (this.tenterEcriture(etat)) {
      this.avertissementPersistance = '';
      return;
    }

    const reduit: EtatDispatch = {
      ...etat,
      lignes: etat.lignes.filter(l => l.ecran)
    };

    if (this.tenterEcriture(reduit)) {
      const abandonnees = etat.lignes.length - reduit.lignes.length;
      this.avertissementPersistance =
        `Répartition volumineuse : seules les ${reduit.lignes.length} lignes ventilées sont `
        + `conservées après rafraîchissement (${abandonnees} ligne(s) écartée(s) du bilan non `
        + 'mémorisée(s)).';
      return;
    }

    this.avertissementPersistance =
      'Répartition trop volumineuse pour le stockage du navigateur : elle reste active mais '
      + 'sera perdue au prochain rafraîchissement.';
    console.warn('[dispatch]', this.avertissementPersistance);
  }

  private tenterEcriture(etat: EtatDispatch): boolean {
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify(etat));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Relit la répartition au démarrage et après un rafraîchissement.
   *
   * <p>L'ancienne clé est encore lue une fois : une répartition posée avant ce
   * changement ne doit pas disparaître sous les pieds de l'utilisateur.</p>
   */
  private relire(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const brut = localStorage.getItem(CLE_STOCKAGE) ?? localStorage.getItem(CLE_HERITEE);
      if (!brut) return;

      const relu = JSON.parse(brut) as EtatDispatch;
      if (!relu || !Array.isArray(relu.lignes)) return;

      this.etat.next({
        lignes: relu.lignes,
        fichier: relu.fichier ?? '',
        importeLe: relu.importeLe ?? '',
        exclues: relu.exclues ?? 0,
        nonVentilees: relu.nonVentilees ?? 0,
        exercice: relu.exercice ?? null,
        entityId: relu.entityId ?? null
      });

      // Migration silencieuse : la reprise se fait sous la nouvelle clé.
      if (!localStorage.getItem(CLE_STOCKAGE)) {
        this.persister();
        localStorage.removeItem(CLE_HERITEE);
      }
    } catch {
      this.etat.next(ETAT_VIDE);
    }
  }
}
