/**
 * Correspondance des libellés français vers les références du référentiel.
 *
 * <p>Le référentiel carbone est rédigé en anglais — « All Other Converted Paper
 * Product Manufacturing » — quand les classeurs de l'ERP et la balance générale
 * sont en français : « Achats matières premières », « Fournitures de bureau ».
 * Aucun rapprochement par libellé ne pouvait aboutir, et ces lignes restaient
 * sans référence quel que soit le degré d'appariement.</p>
 *
 * <p>Chaque entrée cite un code que la base porte réellement. Aucune n'est
 * déduite d'une ressemblance de mots : le rapprochement d'un libellé comptable
 * à un facteur d'émission est une décision métier, et elle doit rester lisible
 * ici plutôt que d'être enfouie dans une heuristique.</p>
 *
 * <p>L'ordre compte : le premier motif qui répond l'emporte. Les libellés les
 * plus spécifiques précèdent donc les plus généraux — « papier kraft » avant
 * « papier », « tôle acier » avant « acier ».</p>
 */

export interface CorrespondanceLibelle {
  /** Motif éprouvé sur le libellé français, accents et casse déjà écartés. */
  motif: RegExp;
  /** Référence du référentiel, telle que la base la porte. */
  code: string;
  /** Ce que la référence documente, en clair. */
  documente: string;
}

/**
 * Table de correspondance, du plus spécifique au plus général.
 *
 * <p>Les motifs s'appliquent à un libellé normalisé : sans accents, sans
 * ponctuation, en minuscules. « Média filtrant » y devient « media filtrant ».</p>
 */
export const TRADUCTIONS_LIBELLE: CorrespondanceLibelle[] = [
  // ---------- Matières premières de la filtration ----------
  { motif: /fibre de cellulose|cellulose/, code: 'MS3C1CF', documente: 'Cellulose fibre production' },
  { motif: /papier kraft|kraft/, code: 'MS3C1KP', documente: 'Kraft paper production' },
  { motif: /media filtrant|papier filtrant/, code: 'MS3C1CP', documente: 'Converted paper product manufacturing' },
  { motif: /carton|boite carton|emballage carton/, code: 'MS3C1CBB', documente: 'Carton board box production' },
  { motif: /papeterie|papier/, code: 'MS3C1PA', documente: 'Paper' },

  // ---------- Métaux ----------
  { motif: /tole acier|tole d acier|laminage acier/, code: 'MS3C1RS', documente: 'Sheet rolling, steel' },
  { motif: /acier galvanise|galvanisation/, code: 'MS3C1NRS', documente: 'Non-recycled galvanized steel' },
  { motif: /tube acier|tuyau acier/, code: 'MS3C1IR', documente: 'Iron and steel pipe and tube' },
  { motif: /acier|fer /, code: 'MS3C1HRS', documente: 'Hot rolling, steel' },
  { motif: /tole aluminium|feuille aluminium/, code: 'MS3C1RA', documente: 'Sheet rolling, aluminium' },
  { motif: /aluminium|alu /, code: 'MS3C1AL', documente: 'Aluminum sheet, plate and foil' },
  { motif: /cuivre/, code: 'MS3C1CR', documente: 'Copper rolling, drawing, extruding' },
  { motif: /visserie|boulonnerie|boulon|vis |ecrou|rivet|rondelle/, code: 'MS3C1B', documente: 'Bolt, nut, screw, rivet and washer' },
  { motif: /traitement de surface|revetement metal|gravure/, code: 'MS3C1MCE', documente: 'Metal coating and engraving' },
  { motif: /piece metallique|pieces metalliques|metallurgie/, code: 'MS3C1MFM', documente: 'Miscellaneous fabricated metal product' },
  { motif: /matiere premiere|matieres premieres|meule|metaux|metal/, code: 'MS3C1M', documente: 'Metals' },

  // ---------- Chimie, colles, peintures ----------
  { motif: /resine epoxy|epoxy/, code: 'MS3C1EPX', documente: 'Epoxy resin, liquid' },
  { motif: /colle polyurethane|adhesif polyurethane/, code: 'MS3C1PAP', documente: 'Polyurethane adhesive production' },
  { motif: /colle|adhesif/, code: 'MS3C1AD', documente: 'Adhesive manufacturing' },
  { motif: /peinture|vernis|revetement/, code: 'MS3C1PCM', documente: 'Paint and coating manufacturing' },
  { motif: /solvant|diluant/, code: 'MS3C1SP', documente: 'Solvent for paint' },
  { motif: /encre/, code: 'MS3C1PI', documente: 'Printing ink manufacturing' },
  { motif: /produit chimique|produits chimiques|chimie/, code: 'MS3C1MCP', documente: 'Miscellaneous chemical product' },

  // ---------- Plastiques, caoutchoucs, mousses ----------
  { motif: /film plastique|feuille plastique/, code: 'MS3C1PF', documente: 'Plastics packaging film and sheet' },
  { motif: /mousse polyurethane|mousse pu/, code: 'MS3C1PU', documente: 'Polyurethane, flexible foam' },
  { motif: /mousse/, code: 'MS3C1UF', documente: 'Urethane and other foam product' },
  { motif: /joint caoutchouc|joint naturel/, code: 'MS3C1NR', documente: 'Seal, natural rubber based' },
  { motif: /caoutchouc synthetique/, code: 'MS3C1SR', documente: 'Synthetic rubber' },
  { motif: /joint|caoutchouc/, code: 'MS3C1RP', documente: 'Rubber product manufacturing for mechanical use' },
  { motif: /plastique|polymere/, code: 'MS3C1PP', documente: 'Plastics product manufacturing' },

  // ---------- Textile ----------
  { motif: /tissage|fibre synthetique/, code: 'MS3C1WSF', documente: 'Weaving, synthetic fibre' },
  { motif: /textile|tissu|toile/, code: 'MS3C1T', documente: 'Textile and fabric finishing mills' },

  // ---------- Bois et emballage ----------
  { motif: /palette/, code: 'MS3C1WP', documente: 'EUR-flat pallet' },
  { motif: /bois|caisse/, code: 'MS3C1WC', documente: 'Wood container and pallet manufacturing' },

  // ---------- Énergie et carburants achetés ----------
  { motif: /gasoil|gazole|diesel|carburant/, code: 'MS3C1DI', documente: 'Market for diesel' },
  { motif: /huile|lubrifiant|graisse/, code: 'MS3C1PL', documente: 'Petroleum lubricating oil and grease' },
  { motif: /electricite haute tension|haute tension/, code: 'MS3C1EHP', documente: 'Electricity, high voltage' },
  // Les limites de mot ne sont pas une précaution de style : sans elles,
  // « fournitures de bureau » contient « eau » et se voyait valoriser par le
  // facteur du réseau d'eau potable.
  { motif: /\beau\b|adduction|eau potable/, code: 'MS3C1WS', documente: 'Water supply and irrigation systems' },

  // ---------- Équipements et composants ----------
  { motif: /machine industrielle|machines industrielles|equipement industriel/, code: 'MS3C1IMM', documente: 'Other industrial machinery manufacturing' },
  { motif: /composant electronique|composants electroniques|electronique/, code: 'MS3C1EC', documente: 'Other electronic component manufacturing' },
  { motif: /ampoule|lampe|eclairage/, code: 'MS3C1EL', documente: 'Electric lamp bulb and part manufacturing' },
  { motif: /ceramique|porcelaine|sanitaire/, code: 'MS3C1PCP', documente: 'Pottery, ceramics and plumbing fixture' },

  // ---------- Services ----------
  { motif: /fourniture de bureau|fournitures de bureau|papeterie bureau/, code: 'MS3C1OS', documente: 'Office supplies and stationery stores' },
  { motif: /telephone|telecom|internet|communication/, code: 'MS3C1WT', documente: 'Wired telecommunications carriers' },
  { motif: /assurance/, code: 'MS3C1IA', documente: 'Insurance agencies and brokerages' },
  { motif: /frais bancaire|frais bancaires|banque|agios/, code: 'MS3C1CB', documente: 'Commercial banking' },
  { motif: /honoraire|juridique|avocat|notaire/, code: 'MS3C1LS', documente: 'All other legal services' },
  { motif: /publicite|communication commerciale|marketing/, code: 'MS3C1AA', documente: 'Advertising agencies' },
  { motif: /gardiennage|securite|surveillance/, code: 'MS3C1SG', documente: 'Security guards and patrol services' },
  { motif: /messagerie|courrier|colis|livraison express/, code: 'MS3C1CED', documente: 'Couriers and express delivery services' },
  { motif: /entretien vehicule|reparation automobile|garage/, code: 'MS3C1GAR', documente: 'General automotive repair' },
  { motif: /location batiment|loyer|bail/, code: 'MS3C1LNB', documente: 'Lessors of nonresidential buildings' },
  { motif: /agence de voyage|reservation voyage/, code: 'MS3C1TA', documente: 'Travel arrangement and reservation services' }
];

/** Forme comparable d'un libellé : sans accents, sans ponctuation, en minuscules. */
function normaliser(valeur: unknown): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Référence du référentiel que désigne un libellé français.
 *
 * <p>Rend {@code null} plutôt qu'une approximation : un libellé qu'aucune entrée
 * ne couvre doit rester sans référence, pour qu'il se voie et soit ajouté à la
 * table en connaissance de cause.</p>
 */
export function referenceDepuisLibelle(libelle: string | null | undefined): string | null {
  const normalise = normaliser(libelle);
  if (!normalise) return null;

  for (const entree of TRADUCTIONS_LIBELLE) {
    if (entree.motif.test(normalise)) return entree.code;
  }
  return null;
}

/** Entrée de la table qui a répondu, pour expliquer un rapprochement. */
export function correspondancePourLibelle(
  libelle: string | null | undefined
): CorrespondanceLibelle | null {
  const normalise = normaliser(libelle);
  if (!normalise) return null;

  return TRADUCTIONS_LIBELLE.find(e => e.motif.test(normalise)) ?? null;
}
