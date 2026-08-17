import { FacteurDetaille } from '../services/referential.service';

/**
 * Appariement d'une ligne d'activité au référentiel carbone.
 *
 * <p>Trois écrans portaient chacun leur copie de cette logique — achats,
 * équipements, combustion. Les quatorze autres n'en avaient aucune : leurs
 * lignes affichaient un tiret à la place de leur référence et gardaient le
 * premier facteur venu de leur catégorie. Réunir la règle ici la rend
 * vérifiable une fois pour tous les scopes, au lieu de dix-sept fois.</p>
 *
 * <p>Aucune dépendance Angular : le composant, le parseur d'import et les bancs
 * de test emploient exactement le même chemin.</p>
 */

/** Degré de certitude qui a désigné le facteur. */
export type Rapprochement = 'REFERENCE' | 'CODE_ARTICLE' | 'CATEGORIE';

/** Ce qu'une ligne d'activité offre pour être appariée. */
export interface CriteresAppariement {
  /** Référence carbone du référentiel MISFAT — « MS3C2ACW ». */
  referenceCarbone?: string | null;
  /** Code article de l'ERP, parfois identique à la référence carbone. */
  codeArticle?: string | null;
  /** Libellé de catégorie, le plus interprétatif des trois. */
  categorie?: string | null;
}

export interface FacteurApparie {
  facteur: FacteurDetaille;
  rapprochement: Rapprochement;
}

/** Forme comparable d'un libellé : sans accents, sans ponctuation, en minuscules. */
export function normaliserLibelle(valeur: unknown): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Forme comparable d'un identifiant : sans espaces, en capitales. */
function normaliserIdentifiant(valeur: unknown): string {
  return String(valeur ?? '').trim().toUpperCase();
}

/**
 * Rattache une ligne à son facteur, par ordre de certitude décroissante.
 *
 * <p>La référence carbone désigne un facteur ; le code article le désigne
 * parfois, quand l'ERP et le référentiel partagent la même codification ; la
 * catégorie ne fait que l'orienter vers une famille.</p>
 *
 * <p>Aucun repli générique n'est appliqué. Une ligne qu'aucun degré ne rattache
 * rend {@code null} : mieux vaut la signaler que la valoriser avec un facteur
 * qui ne la documente pas — c'est ce repli qui faisait apparaître des 0,31 et
 * des 0,38 là où le référentiel portait la valeur exacte.</p>
 */
export function apparier(
  facteurs: readonly FacteurDetaille[] | null | undefined,
  criteres: CriteresAppariement
): FacteurApparie | null {

  if (!Array.isArray(facteurs) || !facteurs.length) return null;

  const parCode = (valeur: string | null | undefined): FacteurDetaille | undefined => {
    const cible = normaliserIdentifiant(valeur);
    if (!cible) return undefined;
    return facteurs.find(f => normaliserIdentifiant(f.referenceCode) === cible);
  };

  const parReference = parCode(criteres.referenceCarbone);
  if (parReference) return { facteur: parReference, rapprochement: 'REFERENCE' };

  const parArticle = parCode(criteres.codeArticle);
  if (parArticle) return { facteur: parArticle, rapprochement: 'CODE_ARTICLE' };

  const categorie = normaliserLibelle(criteres.categorie);
  if (categorie) {
    const parCategorie = facteurs.find(f => normaliserLibelle(f.typeName) === categorie);
    if (parCategorie) return { facteur: parCategorie, rapprochement: 'CATEGORIE' };
  }

  return null;
}

/** Intitulé présentable du degré de rapprochement. */
export function libelleRapprochement(rapprochement: Rapprochement | null | undefined): string {
  switch (rapprochement) {
    case 'REFERENCE': return 'Référence carbone';
    case 'CODE_ARTICLE': return 'Code article ERP';
    case 'CATEGORIE': return 'Catégorie';
    default: return 'Non rapproché';
  }
}

/**
 * Ligne d'activité telle que la migration a besoin de la lire et de l'écrire.
 *
 * <p>Les écrans ne nomment pas leurs champs de la même façon — {@code reference}
 * ici, {@code referenceCarbone} là, {@code quantite} ou {@code quantiteTotale}
 * selon le scope. L'adaptateur laisse chaque écran garder son vocabulaire.</p>
 */
export interface AdaptateurLigne<T> {
  referenceCarbone(ligne: T): string | null | undefined;
  codeArticle(ligne: T): string | null | undefined;
  categorie(ligne: T): string | null | undefined;
  facteurActuel(ligne: T): number | null | undefined;
  baseActuelle(ligne: T): string | null | undefined;
  rapprochementActuel(ligne: T): Rapprochement | null | undefined;
  /** Rend une copie de la ligne rattachée au facteur retenu. */
  appliquer(ligne: T, apparie: FacteurApparie): T;
}

export interface ResultatMigration<T> {
  lignes: T[];
  corrigees: number;
}

/**
 * Rejoue l'appariement sur des lignes déjà enregistrées.
 *
 * <p>Rien n'est écrasé qui ne s'améliore : une ligne déjà rattachée au même
 * facteur, à la même base et par le même degré est laissée telle quelle, et une
 * ligne qu'aucun degré ne rattache garde ce qu'elle portait. Le décompte permet
 * à l'écran de dire ce qui a bougé plutôt que de corriger en silence.</p>
 */
export function remigrerLignes<T>(
  lignes: readonly T[] | null | undefined,
  facteurs: readonly FacteurDetaille[] | null | undefined,
  adaptateur: AdaptateurLigne<T>
): ResultatMigration<T> {

  if (!Array.isArray(lignes) || !lignes.length) return { lignes: [], corrigees: 0 };
  if (!Array.isArray(facteurs) || !facteurs.length) return { lignes: [...lignes], corrigees: 0 };

  let corrigees = 0;

  const migrees = lignes.map(ligne => {
    const apparie = apparier(facteurs, {
      referenceCarbone: adaptateur.referenceCarbone(ligne),
      codeArticle: adaptateur.codeArticle(ligne),
      categorie: adaptateur.categorie(ligne)
    });
    if (!apparie) return ligne;

    const memeFacteur =
      Math.abs((adaptateur.facteurActuel(ligne) ?? 0) - apparie.facteur.factorValue) < 1e-9;
    const memeBase =
      (adaptateur.baseActuelle(ligne) ?? '') === (apparie.facteur.databaseSource ?? '');
    const memeDegre = adaptateur.rapprochementActuel(ligne) === apparie.rapprochement;

    if (memeFacteur && memeBase && memeDegre) return ligne;

    corrigees++;
    return adaptateur.appliquer(ligne, apparie);
  });

  return { lignes: migrees, corrigees };
}

/** Noms des champs qu'un écran emploie pour porter son appariement. */
export interface ChampsLigne {
  /** Référence carbone — « reference » sur la plupart des écrans. */
  reference: string;
  /** Code article ERP. Absent d'un écran, le degré correspondant est ignoré. */
  codeArticle?: string;
  categorie?: string;
  facteur: string;
  base?: string;
  uniteFacteur?: string;
  /** Émission déjà calculée, réajustée par proportion. */
  emission?: string;
  rapprochement?: string;
}

/**
 * Adaptateur générique, réajustant l'émission par proportion.
 *
 * <p>Chaque écran calcule son émission à sa façon : au kilogramme, au kilomètre,
 * au dinar, avec parfois une conversion d'unité en amont. Rejouer ces formules
 * ici demanderait de les connaître toutes, et une seule erreur fausserait
 * l'empreinte d'un scope entier.</p>
 *
 * <p>Or toutes sont linéaires en le facteur : l'émission vaut une grandeur
 * multipliée par lui. Remplacer le facteur revient donc à multiplier l'émission
 * par leur rapport, sans jamais avoir à savoir ce que la grandeur représente.
 * Un ancien facteur nul interdit ce rapport : l'émission est alors laissée en
 * place, et la ligne reste signalée comme non valorisée.</p>
 */
export function adaptateurStandard<T extends Record<string, any>>(
  champs: ChampsLigne
): AdaptateurLigne<T> {

  const lire = (ligne: T, nom?: string) => (nom ? ligne[nom] : undefined);

  return {
    referenceCarbone: ligne => lire(ligne, champs.reference),
    codeArticle: ligne => lire(ligne, champs.codeArticle),
    categorie: ligne => lire(ligne, champs.categorie),
    facteurActuel: ligne => lire(ligne, champs.facteur),
    baseActuelle: ligne => lire(ligne, champs.base),
    rapprochementActuel: ligne => lire(ligne, champs.rapprochement),

    appliquer: (ligne, apparie) => {
      const migree: Record<string, any> = { ...ligne };

      migree[champs.reference] = apparie.facteur.referenceCode;
      migree[champs.facteur] = apparie.facteur.factorValue;
      if (champs.base) migree[champs.base] = apparie.facteur.databaseSource;
      if (champs.uniteFacteur) migree[champs.uniteFacteur] = apparie.facteur.unit;
      if (champs.rapprochement) migree[champs.rapprochement] = apparie.rapprochement;

      if (champs.emission) {
        const ancienFacteur = Number(lire(ligne, champs.facteur) ?? 0);
        const ancienneEmission = Number(lire(ligne, champs.emission) ?? 0);

        if (Number.isFinite(ancienFacteur) && ancienFacteur !== 0) {
          const rapport = apparie.facteur.factorValue / ancienFacteur;
          const reajustee = ancienneEmission * rapport;
          if (Number.isFinite(reajustee)) {
            migree[champs.emission] = parseFloat(reajustee.toFixed(4));
          }
        }
      }

      return migree as T;
    }
  };
}

/**
 * La migration portant ce marqueur a-t-elle déjà été jouée ?
 *
 * <p>Le marqueur vit dans le stockage local, aux côtés des lignes qu'il
 * concerne : les deux disparaissent ensemble si le navigateur est purgé, et la
 * migration se rejoue alors sur des données qui en ont de nouveau besoin.</p>
 */
export function migrationFaite(marqueur: string): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    return localStorage.getItem(marqueur) === 'fait';
  } catch {
    return true;
  }
}

/** Consigne qu'une migration a été jouée, sans jamais interrompre l'écran. */
export function marquerMigration(marqueur: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(marqueur, 'fait');
  } catch {
    // Stockage saturé ou refusé : la migration se rejouera, sans dommage.
  }
}

/** Message rendu à l'utilisateur après une migration ayant corrigé des lignes. */
export function messagePourMigration(corrigees: number): string {
  if (corrigees <= 0) return '';
  return `${corrigees} ligne(s) ont été rapprochées à nouveau du référentiel : `
    + `référence, facteur et base documentaire mis à jour.`;
}
