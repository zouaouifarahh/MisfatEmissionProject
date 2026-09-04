/**
 * Unités proposées à la création d'un facteur d'émission.
 *
 * <p>L'unité était un champ libre. Rien n'empêchait donc d'enregistrer un
 * facteur monétaire libellé « kg », ni un facteur physique libellé « TND » : le
 * calcul multipliait alors une quantité par un ratio qui ne la documente pas, et
 * le résultat n'avait aucune borne. C'est ainsi qu'un poste a pesé quinze
 * millions de tonnes sur un exercice.</p>
 *
 * <p>Les listes ci-dessous guident sans enfermer : elles alimentent une liste de
 * suggestions, non un menu fermé. Une unité inhabituelle — un facteur publié au
 * mètre linéaire, à la pièce — reste saisissable. Fermer le choix reviendrait à
 * décider aujourd'hui de ce que le référentiel documentera demain.</p>
 */

/**
 * Unités physiques essentielles, groupées par grandeur mesurée.
 *
 * <p>Six unités, arrêtées par l'exploitante : ce sont celles que les sources
 * MISFAT emploient réellement. Une liste plus longue — mégawattheures, gigajoules,
 * hectares, tonnes-kilomètres — allongeait le menu de grandeurs qu'aucune source
 * ne porte, et rendait plus difficile de trouver celles qui servent.</p>
 *
 * <p>La création d'un <em>facteur</em>, elle, reste ouverte : son champ d'unité
 * est une liste de suggestions et non un menu fermé, car le référentiel
 * documente des grandeurs que cette liste n'épuise pas.</p>
 */
export const UNITES_PHYSIQUES: { grandeur: string; unites: string[] }[] = [
  { grandeur: 'Masse', unites: ['kg', 't'] },
  { grandeur: 'Volume', unites: ['L', 'm3'] },
  { grandeur: 'Énergie', unites: ['kWh'] },
  { grandeur: 'Distance', unites: ['km'] }
];

/**
 * Unités de saisie des postes de combustion du Scope 1.
 *
 * <p>Les combustibles se relèvent au volume livré, à la masse, ou à l'énergie
 * facturée : un gazole en litres, un GPL en kilogrammes, un gaz naturel en kWh
 * ou en térajoules selon le contrat. L'unité était jusqu'ici imposée par le
 * facteur retenu, ce qui obligeait à convertir la donnée avant de la saisir —
 * et une conversion faite de tête au bord d'un formulaire est une erreur qui
 * attend son tour.</p>
 *
 * <p>Distincte de {@link UNITES_PHYSIQUES}, qui sert les écrans de mesure et
 * n'a pas les mêmes grandeurs : les fondre ferait entrer les kilomètres dans
 * une modale de combustion et les térajoules dans un relevé de déplacement.</p>
 */
export const UNITES_SCOPE_1: readonly string[] = ['L', 'kg', 'Tonne', 'm³', 'kWh', 'MWh', 'TJ'];

/**
 * Liste d'unités augmentée de celle qui est déjà retenue.
 *
 * <p>Le référentiel documente des grandeurs que la liste standard n'épuise
 * pas. Sans ce complément, ouvrir une mesure dont l'unité n'y figure pas la
 * ferait disparaître du menu — et le premier enregistrement la remplacerait en
 * silence par une unité que personne n'a choisie.</p>
 */
export function unitesAvecCourante(courante: string | null | undefined,
                                   liste: readonly string[] = UNITES_SCOPE_1): string[] {
  const valeur = String(courante ?? '').trim();
  if (!valeur) return [...liste];

  const deja = liste.some(u => u.toLowerCase() === valeur.toLowerCase());
  return deja ? [...liste] : [valeur, ...liste];
}

/**
 * Devises admises comme unité d'un facteur monétaire.
 *
 * <p>Le dinar ouvre la liste : c'est la monnaie de tenue des comptes, et donc
 * l'unité de la quasi-totalité des facteurs monétaires du référentiel.</p>
 */
export const UNITES_MONETAIRES: string[] = ['TND', 'EUR', 'USD', 'GBP', 'CHF', 'MAD'];

/**
 * Unités suggérées pour un type de donnée.
 *
 * <p>Un facteur monétaire se libelle dans une devise, un facteur physique dans
 * une grandeur : proposer les deux ensemble inviterait à les confondre, ce qui
 * est précisément le défaut qu'on corrige.</p>
 */
export function unitesProposees(dataType: string | null | undefined): string[] {
  return String(dataType ?? '').toUpperCase() === 'MONETAIRE'
    ? [...UNITES_MONETAIRES]
    : UNITES_PHYSIQUES.flatMap(groupe => groupe.unites);
}

/**
 * L'unité s'accorde-t-elle avec le type de donnée déclaré ?
 *
 * <p>Un facteur monétaire dont l'unité n'est pas une devise ne peut pas être
 * appliqué : la quantité qu'il multiplie est un montant, et le ratio prétend
 * documenter autre chose. Le cas inverse — une devise sur un facteur physique —
 * est tout aussi faux.</p>
 *
 * <p>Une unité non reconnue est acceptée sur un facteur physique : le
 * référentiel documente des grandeurs que cette liste n'épuise pas. Elle est
 * refusée sur un facteur monétaire, où l'ensemble des devises est fini.</p>
 */
export function uniteCoherente(unite: string | null | undefined,
                               dataType: string | null | undefined): boolean {
  const valeur = String(unite ?? '').trim().toUpperCase();
  if (!valeur) return false;

  const monetaire = String(dataType ?? '').toUpperCase() === 'MONETAIRE';
  const estDevise = UNITES_MONETAIRES.includes(valeur);

  return monetaire ? estDevise : !estDevise;
}

/**
 * Plafond de plausibilité d'un facteur monétaire, en kgCO₂e par unité de devise.
 *
 * <p>Miroir de la borne appliquée à la ventilation comptable et par le serveur.
 * Les facteurs du référentiel MISFAT se tiennent entre 0,1 et 0,6 ; les bases
 * entrées-sorties les plus intenses plafonnent vers 5. Cent n'arbitre donc aucun
 * cas discutable — il n'arrête que les valeurs de test restées en base.</p>
 */
export const FACTEUR_MONETAIRE_MAX = 100;

/**
 * Le facteur est-il d'un ordre de grandeur possible pour son type ?
 *
 * <p>Seuls les facteurs monétaires sont bornés. Un facteur physique n'a pas de
 * plafond commun : le PRG d'un réfrigérant se compte en milliers de kgCO₂e par
 * kilogramme, et le brider écarterait des valeurs justes.</p>
 */
export function facteurPlausible(valeur: number | null | undefined,
                                 dataType: string | null | undefined): boolean {
  const facteur = Number(valeur);
  if (!Number.isFinite(facteur) || facteur <= 0) return false;

  if (String(dataType ?? '').toUpperCase() !== 'MONETAIRE') return true;

  return facteur <= FACTEUR_MONETAIRE_MAX;
}
