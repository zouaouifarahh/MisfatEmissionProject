import { DispatchStore, LigneValorisee } from './dispatch-store';
import { EcranDestination } from './regles-dispatch';

/**
 * Conversion des lignes ventilées vers les modèles de saisie des catégories.
 *
 * <p>Une ligne comptable rejoint ainsi la grille de sa catégorie, aux côtés
 * des saisies manuelles. Elle en reste distincte par son identifiant négatif :
 * la sauvegarde de l'écran ne l'écrit jamais dans son stockage local, faute de
 * quoi chaque import la dupliquerait.</p>
 */

/** Une ligne issue de la ventilation, non de la saisie de l'utilisateur. */
export function estLigneVentilee(ligne: { id: number }): boolean {
  return ligne.id < 0;
}

/**
 * Origine portée par une ligne issue de la ventilation.
 *
 * <p>Affichée en pastille dans la grille : une ligne comptable ne se distingue
 * autrement pas d'une saisie faite à la main sur l'usine.</p>
 */
export const SOURCE_VENTILATION = 'Ventilation comptable';

/** Modèle commun aux écrans des Scopes 1 et 2, et aux achats du Scope 3. */
export interface MesureStandard {
  id: number;
  scope: string;
  categorie: string;
  etablissement: string;
  reference: string;
  emissionSource: string;
  typeDonnee: 'Physique' | 'Monetaire';
  quantite: number;
  facteur: number;
  unite: string;
  dateDebut: string;
  dateFin: string;
  emissionCalculee: number;
  hypothese: 'Estimation' | 'Réelle';
  descriptionHypothese?: string;
  creeLe: string;
  databaseSource?: string;
  /** Provenance de la ligne, renseignée pour les seules lignes ventilées. */
  sourceData?: string;
}

/** Période par défaut d'une ligne comptable : l'exercice qu'elle solde. */
function exerciceDe(ligne: LigneValorisee): { debut: string; fin: string } {
  const annee = new Date().getFullYear();
  return { debut: `${annee}-01-01`, fin: `${annee}-12-31` };
}

/**
 * Identifiant stable et négatif, déduit de l'origine de la ligne.
 *
 * <p>Stable pour que deux rendus successifs ne réordonnent pas la grille,
 * négatif pour que l'écran sache qu'elle ne lui appartient pas.</p>
 */
function identifiantVentile(ligne: LigneValorisee, rang: number): number {
  return -(rang + 1);
}

/**
 * Ligne comptable convertie en mesure.
 *
 * <p>Le montant en dinars tient lieu de quantité : le facteur retenu est un
 * ratio monétaire, et l'unité l'annonce sans ambiguïté.</p>
 */
export function adapterVersMesure(
  ligne: LigneValorisee,
  rang: number,
  categorie: string,
  usine = ''
): MesureStandard {

  const exercice = exerciceDe(ligne);

  return {
    id: identifiantVentile(ligne, rang),
    scope: ligne.scope ?? '',
    categorie,
    // L'usine du périmètre actif, non un libellé technique : la colonne
    // « Usine » doit rester lisible comme celle des saisies manuelles.
    etablissement: usine,
    reference: ligne.mainAccount || ligne.reference || 'VENT',
    emissionSource: ligne.nom,
    typeDonnee: 'Monetaire',
    quantite: ligne.quantite,
    facteur: ligne.facteur,
    unite: ligne.uniteFacteur || 'TND',
    dateDebut: exercice.debut,
    dateFin: exercice.fin,
    emissionCalculee: ligne.emissionKg,
    // Un ratio monétaire moyen reste une estimation, jamais un relevé.
    hypothese: 'Estimation',
    descriptionHypothese: ligne.motif,
    creeLe: '',
    databaseSource: ligne.baseAppliquee,
    sourceData: SOURCE_VENTILATION
  };
}

/** Modèle des achats du Scope 3, qui porte en plus sa catégorie carbone. */
export interface AchatVentile extends Omit<MesureStandard, 'emissionSource'> {
  categorieCarbone: string;
  etiquette: string;
}

export function adapterVersAchat(
  ligne: LigneValorisee,
  rang: number,
  usine = ''
): AchatVentile {

  const { emissionSource, ...base } =
    adapterVersMesure(ligne, rang, 'Biens et services achetés', usine);

  return {
    ...base,
    categorieCarbone: ligne.categorieAbsente ? 'Ventilation comptable' : ligne.categorieCarboneTexte,
    etiquette: emissionSource
  };
}

/** Modèle des immobilisations du Scope 3. */
export interface ImmobilisationVentilee {
  id: number;
  scope: string;
  categorie: string;
  numeroImmo: string;
  designation: string;
  categorieCarbone: string;
  categorieTexte: string;
  replique: boolean;
  montant: number;
  devise: string;
  facteur: number;
  uniteFacteur: string;
  libelleFacteur: string;
  baseAppliquee: string;
  origineFacteur: string;
  emissionCalculee: number;
  creeLe: string;
  /** Provenance de la ligne, renseignée pour les seules lignes ventilées. */
  sourceData?: string;
}

export function adapterVersImmobilisation(
  ligne: LigneValorisee,
  rang: number
): ImmobilisationVentilee {

  return {
    id: identifiantVentile(ligne, rang),
    scope: 'SCOPE_3',
    categorie: 'Investissements',
    numeroImmo: ligne.mainAccount || ligne.reference || 'VENT',
    designation: ligne.nom,
    categorieCarbone: ligne.categorieAbsente
      ? 'Équipements Ind. (Fallback #N/A)'
      : ligne.categorieCarboneTexte,
    categorieTexte: ligne.categorieCarboneTexte,
    replique: ligne.categorieAbsente,
    montant: ligne.quantite,
    devise: ligne.uniteFacteur || 'TND',
    facteur: ligne.facteur,
    uniteFacteur: ligne.uniteFacteur || 'TND',
    libelleFacteur: ligne.libelleFacteur,
    baseAppliquee: ligne.baseAppliquee,
    origineFacteur: ligne.origineFacteur,
    emissionCalculee: ligne.emissionKg,
    creeLe: '',
    sourceData: SOURCE_VENTILATION
  };
}

/**
 * Mémoire des conversions déjà faites.
 *
 * <p>Les grilles relisent leurs lignes à chaque cycle de détection : sans
 * cette mémoire, deux mille immobilisations seraient reconverties des dizaines
 * de fois par seconde, et chaque conversion produirait de nouveaux objets que
 * Angular tiendrait pour des lignes différentes.</p>
 */
const MEMOIRE = new WeakMap<object, Map<string, unknown[]>>();

/**
 * Lignes ventilées vers un écran, converties à son modèle.
 *
 * <p>Le résultat est mémorisé sur le lot de lignes du magasin : il ne change
 * qu'à la publication d'une nouvelle répartition.</p>
 */
export function lignesVentileesPour<T>(
  store: DispatchStore,
  ecran: EcranDestination,
  adaptateur: (ligne: LigneValorisee, rang: number) => T,
  variante = ''
): T[] {

  // Les lignes actives, non l'état brut : une répartition d'un autre exercice
  // ou d'une autre société ne doit pas alimenter la grille consultée.
  const lignes = store.lignesActives;
  if (!lignes.length) return [];

  let parEcran = MEMOIRE.get(lignes);
  if (!parEcran) { parEcran = new Map(); MEMOIRE.set(lignes, parEcran); }

  // La variante entre dans la clé : un changement de périmètre change le
  // libellé de l'usine, donc le résultat de la conversion.
  const cle = `${ecran}|${variante}`;
  const dejaFait = parEcran.get(cle);
  if (dejaFait) return dejaFait as T[];

  const converties = lignes
    .filter(ligne => ligne.ecran === ecran)
    .map(adaptateur);

  parEcran.set(cle, converties as unknown[]);
  return converties;
}
