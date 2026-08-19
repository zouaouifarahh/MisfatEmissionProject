import { FacteurDetaille } from '../services/referential.service';
import { referenceDepuisLibelle } from './traduction-libelles';

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
export type Rapprochement =
  | 'REFERENCE' | 'CODE_ARTICLE' | 'CATEGORIE' | 'FAMILLE' | 'LIBELLE';

/**
 * Version de l'appariement.
 *
 * <p>Elle compose le marqueur de chaque écran. L'incrémenter suffit à faire
 * rejouer la migration sur tous les postes au prochain chargement : les anciens
 * marqueurs ne correspondent plus, et {@link purgerMarqueursObsoletes} les
 * efface. C'est le seul endroit à changer — la version vivait auparavant en
 * dix-sept copies, et en oublier une laissait un écran figé.</p>
 *
 * <p>v3 : les familles de l'écran des investissements sont désormais rattachées
 * à leurs références de la catégorie 15, là où la comparaison de libellés à
 * l'identique les laissait sans référence.</p>
 *
 * <p>v4 : les comptes comptables logés dans la colonne du référentiel — 601000,
 * 625000 — rejoignent le code article, et la référence est reprise du facteur
 * retenu. Les lignes migrées en v3 portent encore le compte : elles doivent
 * repasser.</p>
 *
 * <p>v5 : les lignes de ventilation comptable reçoivent la référence du facteur
 * que le magasin leur applique — celle que la table désigne, ou celle dont le
 * ratio est déduit. Elles portaient un tiret faute de la conserver.</p>
 *
 * <p>v6 : un cinquième degré traduit le libellé français vers la référence
 * anglaise du référentiel, et les lignes monétaires quittent le Scope 1. Les
 * deux changent l'appariement des lignes déjà enregistrées.</p>
 *
 * <p>v7 : la règle d'import devient générale — tout achat monétaire quitte le
 * Scope 1, quel que soit le classeur d'origine. Les répartitions déjà publiées
 * doivent être rejouées pour en tenir compte.</p>
 */
export const VERSION_APPARIEMENT = 7;

/** Préfixe commun à tous les marqueurs, toutes versions confondues. */
const PREFIXE_MARQUEUR = 'misfat_ref_matching_v';

/** Marqueur de migration d'un écran, pour la version courante. */
export function marqueurEcran(ecran: string): string {
  return `${PREFIXE_MARQUEUR}${VERSION_APPARIEMENT}_${ecran}`;
}

/**
 * Efface les marqueurs des versions antérieures.
 *
 * <p>Sans cela, le stockage accumulerait un marqueur par écran et par version.
 * Ils ne bloquent plus rien — la version courante ne les lit pas — mais les
 * laisser entretiendrait le doute sur ce qui a déjà été joué.</p>
 *
 * @returns le nombre de marqueurs effacés.
 */
export function purgerMarqueursObsoletes(): number {
  if (typeof localStorage === 'undefined') return 0;

  try {
    const aEffacer: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const cle = localStorage.key(i);
      if (!cle || !cle.startsWith(PREFIXE_MARQUEUR)) continue;

      const version = Number(cle.slice(PREFIXE_MARQUEUR.length).split('_')[0]);
      if (Number.isFinite(version) && version < VERSION_APPARIEMENT) aEffacer.push(cle);
    }

    aEffacer.forEach(cle => localStorage.removeItem(cle));
    return aEffacer.length;
  } catch {
    return 0;
  }
}

/** Ce qu'une ligne d'activité offre pour être appariée. */
export interface CriteresAppariement {
  /** Référence carbone du référentiel MISFAT — « MS3C2ACW ». */
  referenceCarbone?: string | null;
  /** Code article de l'ERP, parfois identique à la référence carbone. */
  codeArticle?: string | null;
  /** Libellé de catégorie, comparé au type du référentiel à l'identique. */
  categorie?: string | null;
  /**
   * Motif de famille, dernier degré et le seul interprétatif.
   *
   * <p>Les écrans nomment leurs familles dans leur propre vocabulaire —
   * « Équipements Ind. (Fallback #N/A) » — quand le référentiel emploie le sien
   * — « Industrial equipment, default monetary ». Comparer ces libellés à
   * l'identique échoue toujours ; le motif, lui, les rapproche.</p>
   *
   * <p>Il est fourni par l'écran, jamais deviné ici : c'est l'écran qui sait
   * quelles familles il manipule.</p>
   */
  motifFamille?: RegExp | null;
  /**
   * Libellé français de la ligne — désignation, étiquette, intitulé du compte.
   *
   * <p>Dernier recours, et le plus interprétatif de tous. Le référentiel est en
   * anglais, les classeurs en français : « Achats matières premières » ne
   * ressemble à aucun {@code typeName}, et aucun degré précédent ne peut le
   * rattacher. La table de traduction fait ce pont, entrée par entrée.</p>
   */
  libelle?: string | null;
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
 * La valeur ressemble-t-elle à un compte comptable plutôt qu'à une référence ?
 *
 * <p>Les références du référentiel MISFAT commencent toutes par « MS » et mêlent
 * lettres et chiffres — MS3C1AAA, MS3C15EQ, MS1COV. Un compte du plan comptable
 * est purement numérique : 601000, 601110, 625000. La distinction est nette, et
 * c'est elle qui permet de rapatrier un compte égaré dans la colonne du
 * référentiel sans risquer d'y déplacer une vraie référence.</p>
 *
 * <p>Quatre chiffres au moins : un « 12 » isolé serait trop ambigu pour qu'on
 * décide à sa place.</p>
 */
export function estCompteComptable(valeur: unknown): boolean {
  return /^\d{4,}$/.test(String(valeur ?? '').trim());
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

  if (criteres.motifFamille) {
    const parFamille = facteurs.find(f => criteres.motifFamille!.test(f.typeName ?? ''));
    if (parFamille) return { facteur: parFamille, rapprochement: 'FAMILLE' };
  }

  // Dernier recours : le libellé français, traduit par la table.
  const codeTraduit = referenceDepuisLibelle(criteres.libelle);
  if (codeTraduit) {
    const parLibelle = facteurs.find(f =>
      normaliserIdentifiant(f.referenceCode) === codeTraduit);
    if (parLibelle) return { facteur: parLibelle, rapprochement: 'LIBELLE' };
  }

  return null;
}

/** Intitulé présentable du degré de rapprochement. */
export function libelleRapprochement(rapprochement: Rapprochement | null | undefined): string {
  switch (rapprochement) {
    case 'REFERENCE': return 'Référence carbone';
    case 'CODE_ARTICLE': return 'Code article ERP';
    case 'CATEGORIE': return 'Catégorie';
    case 'FAMILLE': return 'Famille (rapprochement par motif)';
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
  /** Motif de la famille que porte la ligne, quand l'écran en connaît un. */
  motifFamille?(ligne: T): RegExp | null | undefined;
  /** Libellé français de la ligne, soumis à la table de traduction. */
  libelle?(ligne: T): string | null | undefined;
  facteurActuel(ligne: T): number | null | undefined;
  baseActuelle(ligne: T): string | null | undefined;
  rapprochementActuel(ligne: T): Rapprochement | null | undefined;
  /** Rend une copie de la ligne rattachée au facteur retenu. */
  appliquer(ligne: T, apparie: FacteurApparie): T;
  /**
   * Rend une copie de la ligne dont le compte comptable a quitté la colonne du
   * référentiel pour celle du code article.
   *
   * <p>Optionnel : un écran qui ne porte pas de code article ne peut pas
   * déplacer, et sa ligne est alors laissée telle quelle.</p>
   */
  deplacerCompte?(ligne: T, compte: string): T;
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

  const migrees = lignes.map(ligneOrigine => {
    let ligne = ligneOrigine;
    let deplacee = false;

    // Premier soin : un compte comptable logé dans la colonne du référentiel en
    // sort, même si aucun facteur ne sera trouvé ensuite. Sinon la colonne
    // continuerait d'afficher 601000 comme s'il documentait un facteur.
    const referenceBrute = adaptateur.referenceCarbone(ligne);
    const compteEgare = estCompteComptable(referenceBrute)
      && !facteurs.some(f => normaliserIdentifiant(f.referenceCode) === normaliserIdentifiant(referenceBrute));

    if (compteEgare && adaptateur.deplacerCompte) {
      ligne = adaptateur.deplacerCompte(ligne, String(referenceBrute).trim());
      deplacee = true;
    }

    const apparie = apparier(facteurs, {
      // Le compte ne peut pas désigner une référence, mais il peut désigner un
      // code article : il est essayé à ce titre, jamais à celui de référence.
      referenceCarbone: compteEgare ? '' : referenceBrute,
      codeArticle: adaptateur.codeArticle(ligne),
      categorie: adaptateur.categorie(ligne),
      motifFamille: adaptateur.motifFamille?.(ligne),
      libelle: adaptateur.libelle?.(ligne)
    });

    if (!apparie) {
      if (deplacee) corrigees++;
      return ligne;
    }

    const memeFacteur =
      Math.abs((adaptateur.facteurActuel(ligne) ?? 0) - apparie.facteur.factorValue) < 1e-9;
    const memeBase =
      (adaptateur.baseActuelle(ligne) ?? '') === (apparie.facteur.databaseSource ?? '');
    const memeDegre = adaptateur.rapprochementActuel(ligne) === apparie.rapprochement;

    if (memeFacteur && memeBase && memeDegre && !deplacee) return ligne;

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
  /**
   * Motif de famille déduit de la ligne, quand l'écran sait le fournir.
   *
   * <p>Rendre {@code null} laisse le degré inutilisé : la ligne n'est alors
   * rattachée que par sa référence, son code article ou sa catégorie.</p>
   */
  motifFamille?: (ligne: any) => RegExp | null;
  /** Champ portant le libellé français, soumis à la table de traduction. */
  libelle?: string;
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
    motifFamille: ligne => champs.motifFamille?.(ligne) ?? null,
    libelle: ligne => lire(ligne, champs.libelle),
    facteurActuel: ligne => lire(ligne, champs.facteur),
    baseActuelle: ligne => lire(ligne, champs.base),
    rapprochementActuel: ligne => lire(ligne, champs.rapprochement),

    /**
     * Sort le compte comptable de la colonne du référentiel.
     *
     * <p>Il rejoint le code article quand celui-ci est libre. S'il est déjà
     * occupé, le compte est simplement effacé de la référence : mieux vaut une
     * colonne vide, qui dit « non documenté », qu'une colonne qui affiche un
     * numéro de compte en prétendant nommer un facteur.</p>
     */
    deplacerCompte: (ligne, compte) => {
      const migree: Record<string, any> = { ...ligne };
      migree[champs.reference] = '';

      if (champs.codeArticle && !String(lire(ligne, champs.codeArticle) ?? '').trim()) {
        migree[champs.codeArticle] = compte;
      }

      return migree as T;
    },

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
