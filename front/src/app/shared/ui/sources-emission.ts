import { FacteurDetaille } from '../../services/referential.service';

/**
 * Sources d'émission offertes à la saisie, relevées dans le référentiel.
 *
 * <p>Les écrans de combustion proposaient une liste de sources écrite dans le
 * code. Une source créée au référentiel — avec son facteur — n'y figurait donc
 * jamais, et rien à l'écran ne disait pourquoi : la saisie était impossible sur
 * une donnée pourtant complète en base. L'écran des véhicules faisait pire
 * encore, en interrogeant la base puis en <em>intersectant</em> sa réponse avec
 * la liste écrite : tout ce que le référentiel apportait de neuf était éliminé
 * par la liste qu'il devait remplacer.</p>
 *
 * <p>La base fait foi. La liste écrite ne subsiste que comme secours, pour le
 * cas où le service est injoignable, et elle est alors annoncée comme telle.</p>
 */

/** Une source proposée au formulaire. */
export interface SourceDisponible {
  /**
   * Valeur retenue par le formulaire.
   *
   * <p>C'est le nom du type de référence, et non le code : c'est sur lui que
   * l'appariement du facteur se fait, et le changer romprait le rattachement
   * des lignes déjà saisies.</p>
   */
  nom: string;
  /**
   * Libellé affiché : le nom, suivi du code qui le désigne en base.
   *
   * <p>L'exploitant nomme ses sources par leur code — « FFFFT », « ETABVEH » —
   * alors que la liste n'affichait que le type. Il ne pouvait donc pas
   * reconnaître la source qu'il venait de créer.</p>
   */
  libelle: string;
}

/** Forme comparable d'un libellé : sans accents, sans ponctuation, en minuscules. */
function clef(valeur: string | null | undefined): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

/**
 * Sources documentées par le référentiel pour une catégorie.
 *
 * <p>Un même type de source peut porter plusieurs facteurs — plusieurs bases,
 * plusieurs millésimes. Il n'est proposé qu'une fois : le choix de la variante
 * appartient au sélecteur de base, en aval.</p>
 *
 * @param facteurs      le référentiel tel qu'il a été chargé.
 * @param dansLaCategorie prédicat de catégorie, propre à l'écran appelant.
 */
export function sourcesDuReferentiel(
  facteurs: readonly FacteurDetaille[],
  dansLaCategorie: (nomCategorie: string) => boolean
): SourceDisponible[] {

  const parType = new Map<string, { nom: string; codes: Set<string> }>();

  for (const facteur of facteurs ?? []) {
    if (!dansLaCategorie(facteur.categoryName ?? '')) continue;

    const nom = String(facteur.typeName ?? '').trim();
    if (!nom) continue;

    const cle = clef(nom);
    const groupe = parType.get(cle) ?? { nom, codes: new Set<string>() };

    const code = String(facteur.referenceCode ?? '').trim();
    if (code) groupe.codes.add(code);

    parType.set(cle, groupe);
  }

  return [...parType.values()]
    .map(groupe => ({
      nom: groupe.nom,
      libelle: groupe.codes.size
        ? `${groupe.nom} — ${[...groupe.codes].sort().join(', ')}`
        : groupe.nom
    }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
}

/**
 * Sources qu'aucun facteur du référentiel ne documente.
 *
 * <p>Deux origines, et une seule raison de les garder. Les sources écrites dans
 * le code répondent encore à des facteurs de secours, utiles tant que le service
 * est injoignable. Les sources déjà employées par des lignes enregistrées, elles,
 * doivent rester proposées quoi qu'il arrive : les retirer rendrait ces lignes
 * inéditables, leur source disparaissant du menu à la réouverture.</p>
 *
 * <p>Elles sont rendues dans un groupe distinct : l'exploitant doit voir d'un
 * coup d'œil ce que le référentiel documente et ce qu'il ne documente pas.</p>
 */
export function sourcesHorsReferentiel(
  secours: readonly string[],
  dejaSaisies: readonly string[],
  duReferentiel: readonly SourceDisponible[]
): string[] {

  const connues = new Set(duReferentiel.map(source => clef(source.nom)));
  const retenues = new Map<string, string>();

  for (const brute of [...(secours ?? []), ...(dejaSaisies ?? [])]) {
    const nom = String(brute ?? '').trim();
    if (!nom) continue;

    const cle = clef(nom);
    if (!cle || connues.has(cle) || retenues.has(cle)) continue;

    retenues.set(cle, nom);
  }

  return [...retenues.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}
