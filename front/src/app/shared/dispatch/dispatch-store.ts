import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, map } from 'rxjs';

import { ReferentialService, FacteurDetaille } from '../../services/referential.service';
import { LigneDispatchee } from './dispatch-excel';
import { EcranDestination } from './regles-dispatch';

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
  } {
    const motif = MOTIFS_CATEGORIE[ecran];

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
        unite: retenu.currency?.trim() || retenu.unit || 'TND'
      };
    }

    return {
      valeur: REPLIS_MONETAIRES[ecran],
      origine: 'ADEME Fallback',
      libelle: 'Ratio monétaire moyen (approche spend-based)',
      base: 'ADEME Fallback',
      unite: 'TND'
    };
  }

  /** Valorise des lignes ventilées, sans les publier. */
  valoriser(lignes: LigneDispatchee[]): LigneValorisee[] {
    return lignes.map(ligne => {
      if (!ligne.ecran) {
        return {
          ...ligne, facteur: 0, uniteFacteur: 'TND', libelleFacteur: '',
          baseAppliquee: '', origineFacteur: 'ADEME Fallback' as OrigineFacteur, emissionKg: 0
        };
      }

      const facteur = this.facteurPour(ligne.ecran);
      const emission = ligne.quantite * facteur.valeur;

      return {
        ...ligne,
        facteur: facteur.valeur,
        uniteFacteur: facteur.unite,
        libelleFacteur: facteur.libelle,
        baseAppliquee: facteur.base,
        origineFacteur: facteur.origine,
        emissionKg: Number.isFinite(emission) ? emission : 0
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
