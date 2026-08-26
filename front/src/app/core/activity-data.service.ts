import { Inject, Injectable, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Données d'activité extra-financières, exercice par exercice.
 *
 * <p>Chiffre d'affaires, effectif, production et ventes ne se déduisent
 * d'aucune mesure d'émission : ils sont saisis ou importés. Ils n'en commandent
 * pas moins tout ce que le pilotage carbone a d'utile — l'intensité par pièce
 * produite, la productivité par salarié, les ratios du rapport normé. Cet
 * annuaire en est la source unique : sans lui, chaque écran porterait sa propre
 * copie et les indicateurs finiraient par se contredire.</p>
 *
 * <p>Les données sont rangées par société : le chiffre d'affaires de MISFAT
 * Tunisie n'est pas celui de SOLAUFIL, et les mélanger fausserait toute
 * intensité.</p>
 */

/** Relevé d'activité d'un exercice, pour une société donnée. */
export interface DonneesActivite {
  annee: number;
  /** Chiffre d'affaires, exprimé en millions de la devise du périmètre. */
  chiffreAffairesM: number | null;
  effectif: number | null;
  /** Véhicules de fonction : dénominateur du suivi de la flotte. */
  vehiculesFonction: number | null;
  /** Volume de production, en unités produites. */
  production: number | null;
  /** Volume de ventes, en unités vendues. */
  ventes: number | null;
  /** Horodatage ISO de la dernière écriture. */
  majLe?: string;
}

/** Clé de persistance de l'annuaire d'activité. */
export const CLE_ACTIVITE = 'misfat_donnees_activite';

/** Champs chiffrés d'un relevé, dans l'ordre où les écrans les présentent. */
export const CHAMPS_ACTIVITE = [
  { cle: 'chiffreAffairesM', libelle: "Chiffre d'affaires", unite: 'M' },
  { cle: 'effectif', libelle: 'Effectif total', unite: 'employés' },
  { cle: 'vehiculesFonction', libelle: 'Véhicules de fonction', unite: 'véhicules' },
  { cle: 'production', libelle: 'Volume de production', unite: 'unités' },
  { cle: 'ventes', libelle: 'Volume de ventes', unite: 'unités' }
] as const;

export type ChampActivite = typeof CHAMPS_ACTIVITE[number]['cle'];

/**
 * Seuil au-delà duquel un chiffre d'affaires est tenu pour saisi en unités.
 *
 * <p>Le champ est libellé « M TND » et attend donc 450 pour 450 millions. Rien
 * n'empêchait d'y taper 450 000 000, et le ratio par million devenait alors un
 * millionième de sa valeur — sans que rien ne le signale, puisque le calcul
 * reste parfaitement défini.</p>
 *
 * <p>Dix mille millions valent dix milliards : aucune société du Groupe n'en
 * approche, et une valeur supérieure ne peut donc pas être des millions. Le
 * seuil ne tranche pas un cas douteux, il écarte un cas impossible.</p>
 */
export const SEUIL_CA_UNITES = 10_000;

/**
 * Ramène un chiffre d'affaires à des millions, quelle que soit sa saisie.
 *
 * <p>La conversion est appliquée à l'écriture comme à la relecture : à
 * l'écriture pour que la donnée soit canonique dès qu'elle entre, à la
 * relecture pour que les relevés saisis avant ce correctif cessent de fausser
 * les intensités.</p>
 */
export function chiffreAffairesEnMillions(valeur: number | null | undefined): number | null {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return null;
  return valeur > SEUIL_CA_UNITES ? valeur / 1_000_000 : valeur;
}

/** Le relevé porte-t-il un chiffre d'affaires manifestement saisi en unités ? */
export function chiffreAffairesARequalifier(valeur: number | null | undefined): boolean {
  return typeof valeur === 'number' && Number.isFinite(valeur) && valeur > SEUIL_CA_UNITES;
}

/** Relevé ramené aux unités attendues par les écrans qui le consomment. */
export function normaliserReleve(releve: DonneesActivite): DonneesActivite {
  return { ...releve, chiffreAffairesM: chiffreAffairesEnMillions(releve.chiffreAffairesM) };
}

/** Relevé vierge pour un exercice. */
export function releveVide(annee: number): DonneesActivite {
  return {
    annee,
    chiffreAffairesM: null,
    effectif: null,
    vehiculesFonction: null,
    production: null,
    ventes: null
  };
}

/** Clé de rangement d'une société ; `null` désigne la consolidation groupe. */
function clefSociete(entityId: number | null): string {
  return entityId === null ? 'GROUPE' : String(entityId);
}

@Injectable({ providedIn: 'root' })
export class ActivityDataService implements OnDestroy {
  private readonly donneesSubject = new BehaviorSubject<Record<string, DonneesActivite[]>>({});

  /** Annuaire complet, toutes sociétés confondues. */
  readonly donnees$: Observable<Record<string, DonneesActivite[]>> = this.donneesSubject.asObservable();

  /** Une écriture faite dans un autre onglet doit se voir ici sans rechargement. */
  private readonly surStockage = (evenement: StorageEvent): void => {
    if (evenement.key !== null && evenement.key !== CLE_ACTIVITE) return;
    this.synchroniser();
  };

  constructor(@Inject(PLATFORM_ID) private readonly platformId: Object) {
    this.donneesSubject.next(this.relire());

    if (isPlatformBrowser(this.platformId)) {
      window.addEventListener('storage', this.surStockage);
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('storage', this.surStockage);
    }
  }

  /** Relit le stockage ; silencieux quand rien n'a changé. */
  synchroniser(): Record<string, DonneesActivite[]> {
    if (!isPlatformBrowser(this.platformId)) return this.donneesSubject.value;

    const stocke = this.relire();
    if (JSON.stringify(stocke) !== JSON.stringify(this.donneesSubject.value)) {
      this.donneesSubject.next(stocke);
    }
    return this.donneesSubject.value;
  }

  /** Relevés d'une société, du plus ancien exercice au plus récent. */
  liste(entityId: number | null): DonneesActivite[] {
    const tous = this.donneesSubject.value[clefSociete(entityId)] ?? [];
    return [...tous].sort((a, b) => a.annee - b.annee);
  }

  /** Relevé d'un exercice précis ; `null` s'il n'a pas été renseigné. */
  pour(entityId: number | null, annee: number | null): DonneesActivite | null {
    if (annee === null) return null;
    return this.liste(entityId).find(releve => releve.annee === annee) ?? null;
  }

  /**
   * Valeur d'un champ pour un exercice.
   *
   * <p>Renvoie `null` plutôt que zéro quand la donnée manque : un dénominateur
   * absent doit interdire le calcul du ratio, là où un zéro le ferait diverger
   * ou l'écraserait silencieusement.</p>
   */
  valeur(entityId: number | null, annee: number | null, champ: ChampActivite): number | null {
    const valeur = this.pour(entityId, annee)?.[champ];
    return typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;
  }

  /** Exercices renseignés pour une société. */
  annees(entityId: number | null): number[] {
    return this.liste(entityId).map(releve => releve.annee);
  }

  /** Enregistre ou remplace le relevé d'un exercice. */
  enregistrer(entityId: number | null, releve: DonneesActivite): void {
    const clef = clefSociete(entityId);
    const tous = { ...this.synchroniser() };
    const societe = [...(tous[clef] ?? [])];

    // Normalisation à l'entrée : la donnée est canonique dès qu'elle est
    // enregistrée, et tous les écrans qui la relisent — tableau de bord,
    // rapport, consolidation — partent de la même valeur.
    const complet: DonneesActivite = {
      ...normaliserReleve(releve), majLe: new Date().toISOString()
    };
    const index = societe.findIndex(r => r.annee === releve.annee);

    if (index >= 0) societe[index] = complet;
    else societe.push(complet);

    tous[clef] = societe.sort((a, b) => a.annee - b.annee);
    this.publier(tous);
  }

  /** Enregistre plusieurs exercices d'un coup, à l'issue d'un import. */
  enregistrerLot(entityId: number | null, releves: DonneesActivite[]): void {
    for (const releve of releves) this.enregistrer(entityId, releve);
  }

  supprimer(entityId: number | null, annee: number): void {
    const clef = clefSociete(entityId);
    const tous = { ...this.synchroniser() };
    tous[clef] = (tous[clef] ?? []).filter(releve => releve.annee !== annee);
    this.publier(tous);
  }

  private publier(tous: Record<string, DonneesActivite[]>): void {
    this.donneesSubject.next(tous);

    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(CLE_ACTIVITE, JSON.stringify(tous));
    } catch (erreur) {
      console.error('[activite] Données d\'activité non persistées', erreur);
    }
  }

  private relire(): Record<string, DonneesActivite[]> {
    if (!isPlatformBrowser(this.platformId)) return {};

    try {
      const brut = localStorage.getItem(CLE_ACTIVITE);
      const relu = brut ? JSON.parse(brut) : null;
      if (!relu || typeof relu !== 'object') return {};

      // Un contenu partiellement corrompu ne doit pas emporter tout l'annuaire :
      // seules les entrées exploitables sont conservées.
      const propre: Record<string, DonneesActivite[]> = {};
      for (const [clef, valeur] of Object.entries(relu)) {
        if (Array.isArray(valeur)) {
          // Les relevés saisis avant l'introduction du seuil sont requalifiés
          // ici : sans quoi un chiffre d'affaires déjà stocké en unités
          // continuerait d'écraser l'intensité par million.
          propre[clef] = valeur
            .filter(r => r && Number.isFinite(Number(r.annee)))
            .map(normaliserReleve);
        }
      }
      return propre;
    } catch {
      return {};
    }
  }
}
