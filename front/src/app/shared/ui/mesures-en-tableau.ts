import { MesureServeur, mesureDuPerimetre } from '../../services/mesures-serveur.service';
import { PerimetreOrganisation } from '../../core/perimetre';

/**
 * Mesures de la base versées dans le tableau d'un écran de saisie.
 *
 * <p>Les écrans affichaient ces mesures dans un panneau séparé, au-dessus de
 * leur tableau : « 1 mesure(s) enregistrée(s) en base », puis, deux lignes plus
 * bas, « aucune donnée enregistrée sur ce périmètre ». Les deux portaient sur
 * la même donnée et se contredisaient, sans que rien ne dise laquelle croire.</p>
 *
 * <p>Le rattachement reproduit exactement celui du panneau remplacé — mêmes
 * critères, même périmètre, même exercice —, de sorte que rien n'apparaisse ni
 * ne disparaisse au passage.</p>
 */

/** Ce qui rattache une mesure de la base à un écran. */
export interface CriteresEcran {
  /**
   * Numéro de catégorie GHG, pour le Scope 3.
   *
   * <p>Seul repère univoque entre les deux nomenclatures : la base écrit
   * « Category 8: Upstream leased assets » là où l'écran dit « Actifs loués en
   * amont ». Les libellés ne se rejoignent jamais ; le numéro ne bouge pas.</p>
   */
  numeroGhg?: number | null;

  /**
   * Libellés supplémentaires que l'écran documente.
   *
   * <p>Les Scopes 1 et 2 n'ont pas de numéro GHG, et un même poste y porte
   * souvent deux intitulés — le français saisi à la main, l'anglais venu de
   * l'import.</p>
   */
  categories?: string[];
}

/**
 * Mesures de la base qui relèvent de cet écran, dans le périmètre consulté.
 */
export function mesuresDeLEcran(mesures: MesureServeur[],
                                criteres: CriteresEcran,
                                exercice: number | null,
                                organisation: PerimetreOrganisation): MesureServeur[] {

  const attendues = new Set((criteres.categories ?? []).map(clefCategorie));

  return mesures.filter(m =>
    releveDeLEcran(m.categorie, criteres.numeroGhg ?? null, attendues)
    && mesureDuPerimetre(m, exercice, organisation));
}

/**
 * Le libellé de la base relève-t-il de cet écran ?
 *
 * <p>Le numéro doit être suivi d'une frontière : sans elle, « Category 1 »
 * capterait « Category 15 », et les investissements viendraient grossir les
 * biens et services achetés.</p>
 */
function releveDeLEcran(categorie: string,
                        numeroGhg: number | null,
                        attendues: Set<string>): boolean {

  const cle = clefCategorie(categorie);
  if (!cle) return false;

  if (numeroGhg !== null) {
    const numero = /^category(\d{1,2})/.exec(cle)?.[1];
    if (numero && Number(numero) === numeroGhg) return true;
  }

  return attendues.has(cle);
}

/**
 * Champs d'une ligne d'écran que la base renseigne réellement.
 *
 * <p>Les écrans décrivent des postes très différents — un actif loué porte un
 * ratio d'occupation, un voyage un numéro d'ordre de mission — et la base n'en
 * sait rien. Ces champs restent vides : une cellule blanche dit « on ne sait
 * pas », une valeur inventée dirait le contraire.</p>
 */
export interface LigneDeLaBase {
  id: number;
  scope: string;
  categorie: string;
  reference: string;
  quantite: number;
  unite: string;
  facteur: number;
  emissionCalculee: number;
  dateDebut: string;
  dateFin: string;
  creeLe: string;
  baseAppliquee: string;
  databaseSource: string;
  provenance: string;
  /** Ligne venue de la base : l'écran ne propose ni modification ni suppression. */
  lectureSeule: true;
}

/**
 * Convertit une mesure de la base en ligne de tableau.
 *
 * <p>Le résultat est transtypé vers le modèle de l'écran appelant. Les champs
 * propres à ce modèle restent indéfinis : les gabarits les interpolent sans
 * jamais les déréférencer, une cellule vide est donc leur rendu naturel.</p>
 *
 * @param libelleCategorie intitulé de l'écran, non celui de la base : c'est
 *        celui que la colonne « Catégorie » doit montrer.
 */
export function ligneDeLaBase(mesure: MesureServeur, libelleCategorie: string): LigneDeLaBase {
  return {
    id: mesure.id,
    scope: mesure.scope,
    categorie: libelleCategorie,
    reference: '',
    quantite: mesure.quantite,
    unite: mesure.unite,
    // Le facteur n'est pas rendu par l'API : il se déduit du rapport, et vaut
    // zéro sur une quantité nulle plutôt que l'infini.
    facteur: mesure.quantite ? mesure.emissionKg / mesure.quantite : 0,
    emissionCalculee: mesure.emissionKg,
    dateDebut: mesure.date,
    dateFin: mesure.date,
    creeLe: mesure.date,
    baseAppliquee: mesure.baseAppliquee,
    databaseSource: mesure.baseAppliquee,
    provenance: mesure.origine,
    lectureSeule: true
  };
}

/** Forme comparable d'un libellé : sans accents, sans ponctuation, en minuscules. */
function clefCategorie(valeur: string | null | undefined): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}
