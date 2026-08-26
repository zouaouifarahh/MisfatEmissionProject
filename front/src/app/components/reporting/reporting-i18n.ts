/**
 * Dictionnaire bilingue du rapport de bilan carbone.
 *
 * <p>Le rapport doit pouvoir être remis en français comme en anglais. Les
 * libellés vivent ici, hors des gabarits : un terme de comptabilité carbone se
 * traduit une fois, et les deux versions restent côte à côte — c'est ce qui
 * permet de vérifier qu'elles disent la même chose.</p>
 *
 * <p>Les termes du GHG Protocol ne sont pas traduits lorsqu'ils sont
 * normalisés : « Scope 1 », <em>location-based</em>, <em>market-based</em> et
 * CBAM s'écrivent ainsi dans les deux langues. Les traduire créerait un
 * vocabulaire propre à MISFAT, illisible pour un vérificateur externe.</p>
 */

/** Langues proposées pour le rapport. */
export type LangueRapport = 'FR' | 'EN';

/** Entrée du dictionnaire : les deux versions d'un même libellé. */
interface Traduction {
  fr: string;
  en: string;
}

/**
 * Libellés du rapport, par clé.
 *
 * <p>La clé décrit l'emplacement plutôt que le texte : renommer un intitulé ne
 * doit pas obliger à renommer sa clé partout.</p>
 */
export const LIBELLES: Record<string, Traduction> = {

  // ---------- EN-TÊTE ET COMMANDES ----------
  'doc.titre': { fr: 'Bilan Carbone Exécutif', en: 'Executive Carbon Footprint Report' },
  'doc.sousTitre': {
    fr: 'Synthèse GHG Protocol — Scopes 1, 2 et 3',
    en: 'GHG Protocol summary — Scopes 1, 2 and 3'
  },
  'doc.exercice': { fr: 'Exercice', en: 'Reporting year' },
  'doc.perimetre': { fr: 'Périmètre', en: 'Reporting boundary' },
  'doc.pays': { fr: 'Pays', en: 'Country' },
  'doc.devise': { fr: 'Devise', en: 'Currency' },
  'doc.etabliLe': { fr: 'Établi le', en: 'Issued on' },
  'doc.par': { fr: 'par', en: 'by' },
  'doc.reference': { fr: 'Référence', en: 'Reference' },

  'cfg.titre': { fr: 'Configuration du rapport exécutif', en: 'Executive report settings' },
  'cfg.pays': { fr: 'Pays', en: 'Country' },
  'cfg.exercice': { fr: 'Exercice', en: 'Reporting year' },
  'cfg.tousPays': { fr: '🌍 Toutes implantations', en: '🌍 All locations' },
  'cfg.tousExercices': { fr: 'Tous exercices', en: 'All reporting years' },
  'cfg.enCours': { fr: '— en cours', en: '— current' },
  'cfg.societes': { fr: 'société(s)', en: 'entity(ies)' },
  'cfg.consolidation': { fr: 'Consolidation de', en: 'Consolidation of' },
  'cfg.telecharger': { fr: '⬇️ Télécharger le PDF', en: '⬇️ Download PDF' },
  'cfg.replier': { fr: '▲ Replier', en: '▲ Collapse' },
  'cfg.deployer': { fr: '▼ Déployer', en: '▼ Expand' },

  // ---------- TITRES DES SECTIONS ----------
  'sec1.titre': { fr: '1. Synthèse exécutive', en: '1. Executive summary' },
  'sec1.contexte': {
    fr: '1. Synthèse exécutive — analyse contextuelle',
    en: '1. Executive summary — contextual analysis'
  },
  'sec1.performance': { fr: '1.1 Lecture de la performance carbone', en: '1.1 Carbon performance review' },
  'sec1.top5': { fr: '1.2 Top 5 des postes émetteurs', en: '1.2 Top 5 emission sources' },
  'sec1.ecarts': { fr: '1.3 Explication des écarts', en: '1.3 Variance analysis' },

  'sec2.titre': {
    fr: '2. Cadre méthodologique et périmètre',
    en: '2. Methodological framework and boundary'
  },
  'sec2.principes': { fr: '2.0 Principes du GHG Protocol', en: '2.0 GHG Protocol principles' },
  'sec2.referentiels': { fr: '2.1 Référentiels appliqués', en: '2.1 Standards applied' },
  'sec2.organisationnel': { fr: '2.2 Périmètre organisationnel', en: '2.2 Organisational boundary' },
  'sec2.consolidation': {
    fr: '2.3 Règle de consolidation multi-sociétés',
    en: '2.3 Multi-entity consolidation rule'
  },
  'sec2.maturite': { fr: '2.4 Matrice de maturité de la donnée', en: '2.4 Data maturity matrix' },
  'sec2.qualite': { fr: '2.5 Postes retenus et incertitude', en: '2.5 Reported sources and uncertainty' },
  'sec2.sansMesure': {
    fr: '2.6 Postes de la nomenclature restés sans mesure',
    en: '2.6 Inventory sources with no recorded data'
  },

  'sec3.titre': {
    fr: '3. Gaz à effet de serre et facteurs locaux',
    en: '3. Greenhouse gases and local emission factors'
  },
  'sec3.prgQuoi': {
    fr: '3.0 Ce que mesure un potentiel de réchauffement',
    en: '3.0 What a global warming potential measures'
  },
  'sec3.prgTable': {
    fr: '3.1 Potentiels de réchauffement appliqués (GIEC AR5, 100 ans)',
    en: '3.1 Global warming potentials applied (IPCC AR5, 100 years)'
  },
  'sec3.ventilation': { fr: '3.2 Ventilation de l\'empreinte par gaz', en: '3.2 Footprint breakdown by gas' },
  'sec3.mix': {
    fr: '3.3 Mix électrique national et allocation des facteurs',
    en: '3.3 National electricity mix and factor allocation'
  },
  'sec3.facteursEnergie': {
    fr: '3.4 Facteurs du mix énergétique appliqués',
    en: '3.4 Energy factors applied'
  },
  'sec3.facteursAutres': {
    fr: '3.5 Principaux facteurs de combustion et de matière',
    en: '3.5 Main combustion and material factors'
  },

  'sec4.titre': {
    fr: '4. Analyse déterministe des trois scopes',
    en: '4. Deterministic analysis of the three scopes'
  },
  'sec4.scope1': { fr: '4.1 Scope 1 — émissions directes', en: '4.1 Scope 1 — direct emissions' },
  'sec4.scope2': {
    fr: '4.2 Scope 2 — énergie indirecte achetée',
    en: '4.2 Scope 2 — purchased indirect energy'
  },
  'sec4.scope3': { fr: '4.3 Scope 3 — chaîne de valeur', en: '4.3 Scope 3 — value chain' },
  'sec4.detail': { fr: 'Détail des catégories retenues', en: 'Detail of reported categories' },

  'sec5.titre': {
    fr: '5. Ratios d\'intensité et vulnérabilité',
    en: '5. Intensity ratios and vulnerability'
  },
  'sec5.ratios': { fr: '5.1 Ratios d\'intensité du périmètre', en: '5.1 Intensity ratios for the boundary' },
  'sec5.positionnement': {
    fr: '5.2 Positionnement et lecture critique',
    en: '5.2 Benchmarking and critical review'
  },
  'sec5.cbam': {
    fr: '5.3 Exposition à la tarification du carbone (CBAM / MACF)',
    en: '5.3 Carbon pricing exposure (CBAM)'
  },
  'sec5.vulnerabilite': { fr: '5.4 Matrice de vulnérabilité', en: '5.4 Vulnerability matrix' },

  'sec6.titre': {
    fr: '6. Plan d\'action et trajectoire de réduction',
    en: '6. Action plan and reduction pathway'
  },
  'sec6.trajectoire': { fr: '6.1 Trajectoire de l\'exercice', en: '6.1 Pathway for the reporting year' },
  'sec6.jalons': { fr: '6.2 Jalons Net-Zero', en: '6.2 Net-Zero milestones' },
  'sec6.leviers': { fr: '6.3 Leviers de décarbonation', en: '6.3 Decarbonisation levers' },
  'sec6.fiches': { fr: '6.4 Fiches détaillées des quatre leviers', en: '6.4 Detailed lever sheets' },
  'sec6.solutions': {
    fr: '6.5 Plan d\'action & Recommandations RSE',
    en: '6.5 CSR action plan & recommendations'
  },
  'p.s6.solutionsIntro': {
    fr: 'Les mesures ci-dessous sont celles que la direction a arrêtées pour ce périmètre. '
      + 'À la différence des leviers qui précèdent — communs au secteur et proposés à titre '
      + 'indicatif —, elles engagent l\'entreprise. Elles sont reprises du chapitre 11 du '
      + 'rapport normé, dont elles constituent le détail.',
    en: 'The measures below are those management has committed to for this scope. Unlike the '
      + 'preceding levers — industry-wide and indicative only — these are binding. They are '
      + 'taken from chapter 11 of the standard-form report, where they are set out in full.'
  },
  'p.s6.solutionsVides': {
    fr: 'Aucune solution n\'est encore consignée. Le chapitre 11 du rapport normé — onglet '
      + '« Rapport normé » — permet de les saisir ; elles paraîtront alors ici.',
    en: 'No measure has been recorded yet. Chapter 11 of the standard-form report — the '
      + '“Standard report” tab — is where they are entered; they will then appear here.'
  },
  // « th.portee » désigne déjà la portée d'une règle d'exclusion : la portée
  // d'une mesure du plan d'action prend sa propre clé plutôt que d'en détourner
  // une dont l'anglais dit autre chose.
  'th.porteeMesure': { fr: 'Portée', en: 'Scope' },
  'th.impactAttendu': { fr: 'Impact attendu', en: 'Expected impact' },
  'p.s6.solutionSansDetail': {
    fr: 'Portée et impact restent à préciser au chapitre 11.',
    en: 'Scope and impact are yet to be set out in chapter 11.'
  },

  'annexeA.titre': { fr: 'Annexe A — Méthodologie de collecte', en: 'Appendix A — Data collection methodology' },
  'annexeA.fiches': { fr: 'A.1 Fiches de collecte par poste', en: 'A.1 Collection sheets by source' },
  'annexeA.exclusions': { fr: 'A.2 Règles d\'exclusion', en: 'A.2 Exclusion rules' },
  'annexeA.tracabilite': { fr: 'A.3 Traçabilité et conservation', en: 'A.3 Traceability and retention' },

  // ---------- EN-TÊTES DE TABLEAUX ----------
  'th.rang': { fr: 'Rang', en: 'Rank' },
  'th.poste': { fr: 'Poste', en: 'Source' },
  'th.scope': { fr: 'Scope', en: 'Scope' },
  'th.part': { fr: 'Part', en: 'Share' },
  'th.cumul': { fr: 'Cumul', en: 'Cumulative' },
  'th.lignes': { fr: 'Lignes', en: 'Records' },
  'th.provenance': { fr: 'Provenance', en: 'Data origin' },
  'th.categorie': { fr: 'Catégorie', en: 'Category' },
  'th.gaz': { fr: 'Gaz', en: 'Gas' },
  'th.formule': { fr: 'Formule', en: 'Formula' },
  'th.prg': { fr: 'PRG 100 ans', en: 'GWP 100 years' },
  'th.sources': { fr: 'Sources sur le périmètre', en: 'Sources within the boundary' },
  'th.reference': { fr: 'Référence', en: 'Reference' },
  'th.sourceEmission': { fr: 'Source d\'émission', en: 'Emission source' },
  'th.facteur': { fr: 'Facteur', en: 'Factor' },
  'th.unite': { fr: 'Unité', en: 'Unit' },
  'th.base': { fr: 'Base documentaire', en: 'Reference database' },
  'th.annee': { fr: 'Année', en: 'Year' },
  'th.incertitude': { fr: 'Incertitude', en: 'Uncertainty' },
  'th.ratio': { fr: 'Ratio', en: 'Ratio' },
  'th.valeur': { fr: 'Valeur', en: 'Value' },
  'th.denominateur': { fr: 'Dénominateur', en: 'Denominator' },
  'th.risque': { fr: 'Risque', en: 'Risk' },
  'th.nature': { fr: 'Nature', en: 'Type' },
  'th.exposition': { fr: 'Exposition', en: 'Exposure' },
  'th.probabilite': { fr: 'Probabilité', en: 'Likelihood' },
  'th.impact': { fr: 'Impact', en: 'Impact' },
  'th.horizon': { fr: 'Horizon', en: 'Horizon' },
  'th.reduction': { fr: 'Réduction visée', en: 'Target reduction' },
  'th.referentiel': { fr: 'Référentiel', en: 'Framework' },
  'th.statut': { fr: 'Statut', en: 'Status' },
  'th.levier': { fr: 'Levier', en: 'Lever' },
  'th.action': { fr: 'Action', en: 'Action' },
  'th.priorite': { fr: 'Priorité', en: 'Priority' },
  'th.donnee': { fr: 'Donnée collectée', en: 'Data collected' },
  'th.justificatif': { fr: 'Source justificative', en: 'Supporting document' },
  'th.frequence': { fr: 'Fréquence', en: 'Frequency' },
  'th.controle': { fr: 'Contrôle appliqué', en: 'Control applied' },
  'th.regle': { fr: 'Règle', en: 'Rule' },
  'th.portee': { fr: 'Portée', en: 'Scope of rule' },
  'th.justification': { fr: 'Justification', en: 'Rationale' },
  'th.maturite': { fr: 'Maturité', en: 'Maturity' },
  'th.verifiabilite': { fr: 'Vérifiabilité', en: 'Verifiability' },
  'th.observation': { fr: 'Observation', en: 'Comment' },
  'th.approche': { fr: 'Approche', en: 'Approach' },
  'th.consequence': { fr: 'Conséquence', en: 'Consequence' },

  // ---------- VALEURS ET ÉTATS ----------
  'val.aucunPoste': { fr: 'Aucun poste chiffré sur ce périmètre.', en: 'No quantified source within this boundary.' },
  'val.aucunRetenu': { fr: 'Aucun poste retenu.', en: 'No source selected.' },
  'val.nonDisponible': { fr: 'n.d.', en: 'n/a' },
  'val.aEtablir': { fr: 'à établir', en: 'to be established' },
  'val.chargement': { fr: 'Consolidation en cours…', en: 'Consolidating…' },

  'niv.ELEVEE': { fr: 'Élevée', en: 'High' },
  'niv.MOYENNE': { fr: 'Moyenne', en: 'Medium' },
  'niv.FAIBLE': { fr: 'Faible', en: 'Low' },
  'niv.ELEVE': { fr: 'Élevé', en: 'High' },
  'niv.MOYEN': { fr: 'Moyen', en: 'Medium' },
  'niv.Transition': { fr: 'Transition', en: 'Transition' },
  'niv.Physique': { fr: 'Physique', en: 'Physical' },

  'sta.Prerequis': { fr: 'Prérequis', en: 'Prerequisite' },
  'sta.AEngager': { fr: 'À engager', en: 'To be committed' },
  'sta.CibleLongTerme': { fr: 'Cible long terme', en: 'Long-term target' },

  // ---------- UNITÉS ET RATIOS ----------
  'unite.tco2e': { fr: 'tCO₂e', en: 'tCO₂e' },
  'unite.parUnite': { fr: 'kgCO₂e / unité', en: 'kgCO₂e / unit' },
  'unite.parEmploye': { fr: 'tCO₂e / employé', en: 'tCO₂e / employee' },
  'unite.parMillion': { fr: 'tCO₂e / M', en: 'tCO₂e / M' },
  'unite.employes': { fr: 'employés', en: 'employees' },
  'unite.unites': { fr: 'unités', en: 'units' },

  'ratio.employe': { fr: 'Intensité par employé', en: 'Intensity per employee' },
  'ratio.produit': { fr: 'Intensité par unité produite', en: 'Intensity per unit produced' },
  'ratio.ca': { fr: 'Intensité par chiffre d\'affaires', en: 'Intensity per revenue' },

  // ---------- PIEDS DE PAGE ----------
  'pied.sec1': { fr: 'Section 1 — Synthèse exécutive', en: 'Section 1 — Executive summary' },
  'pied.sec2': { fr: 'Section 2 — Cadre méthodologique', en: 'Section 2 — Methodological framework' },
  'pied.sec3': { fr: 'Section 3 — Gaz et facteurs', en: 'Section 3 — Gases and factors' },
  'pied.sec4': { fr: 'Section 4 — Analyse des scopes', en: 'Section 4 — Scope analysis' },
  'pied.sec5': { fr: 'Section 5 — Ratios et vulnérabilité', en: 'Section 5 — Ratios and vulnerability' },
  'pied.sec6': { fr: 'Section 6 — Plan d\'action et trajectoire', en: 'Section 6 — Action plan and pathway' },
  'pied.annexeA': { fr: 'Annexe A — Méthodologie de collecte', en: 'Appendix A — Collection methodology' },

  // ---------- PAGE DE GARDE ----------
  'garde.titreDoc': { fr: 'Bilan carbone — GHG Protocol', en: 'Carbon footprint — GHG Protocol' },
  'garde.document': { fr: 'Document', en: 'Document' },
  'garde.auteur': { fr: 'Auteur', en: 'Author' },
  'garde.dateImpression': { fr: 'Date d\'impression', en: 'Issue date' },
  'garde.methodologie': { fr: 'Méthodologie', en: 'Methodology' },
  'garde.perimetreRetenu': { fr: 'Périmètre retenu', en: 'Selected boundary' },
  'garde.paysDevise': { fr: 'Pays / devise', en: 'Country / currency' },
  'garde.langue': { fr: 'Langue du document', en: 'Document language' },

  // ---------- SYNTHÈSE ET CARTES ----------
  'syn.titre': { fr: 'Synthèse exécutive', en: 'Executive summary' },
  'syn.empreinteTotale': { fr: 'Empreinte totale du périmètre', en: 'Total carbon footprint' },
  'syn.repartition': { fr: 'Répartition par scope', en: 'Breakdown by scope' },
  'syn.contributeurs': { fr: 'Principaux contributeurs', en: 'Top emitters' },
  'syn.lecture': { fr: 'Lecture du bilan', en: 'Reading the inventory' },
  'syn.trajectoire': { fr: 'Trajectoire & objectif de réduction', en: 'Reduction pathway & target' },
  'syn.totalRetenu': { fr: 'Total des catégories retenues', en: 'Total of reported categories' },
  'syn.tco2eRetenues': { fr: 'tCO₂e retenues', en: 'tCO₂e reported' },
  'syn.hausses': { fr: 'Principales hausses', en: 'Main increases' },
  'syn.baisses': { fr: 'Principales baisses', en: 'Main decreases' },
  'syn.aucuneHausse': { fr: 'Aucune hausse relevée.', en: 'No increase recorded.' },
  'syn.aucuneBaisse': { fr: 'Aucune baisse relevée.', en: 'No decrease recorded.' },
  'syn.aucunChiffre': {
    fr: 'Aucun poste chiffré parmi les catégories retenues.',
    en: 'No quantified source among the reported categories.'
  },
  'syn.origineDonnee': { fr: 'Origine de la donnée', en: 'Data origin' },
  'syn.emissions': { fr: 'Émissions (tCO₂e)', en: 'Emissions (tCO₂e)' },
  'syn.mode2': {
    fr: 'Mode 2 · Rapport Normé GHG Protocol',
    en: 'Mode 2 · GHG Protocol compliance report'
  },
  'syn.inventaire11': {
    fr: 'Inventaire complet en 11 chapitres réglementaires',
    en: 'Full inventory across 11 regulatory chapters'
  },

  // ---------- PARAGRAPHES : SECTION 1 ----------
  'p.s1.perf1': {
    fr: 'La couverture qualifie la portée de ce chiffre : ce qui n\'est pas collecté n\'est pas '
      + 'nul, il est simplement hors de l\'inventaire.',
    en: 'Coverage qualifies the reach of this figure: what is not collected is not zero, it is '
      + 'merely outside the inventory.'
  },
  'p.s1.perf2': {
    fr: 'La répartition entre les trois scopes commande la stratégie. Un profil dominé par le '
      + 'Scope 2 relève de l\'approvisionnement électrique et se traite par contrat ou par '
      + 'autoproduction ; un profil dominé par le Scope 1 relève des procédés et des fluides, et '
      + 'se traite par investissement industriel ; un profil dominé par le Scope 3 déplace '
      + 'l\'effort vers les achats et la logistique, où l\'entreprise n\'a qu\'une influence '
      + 'indirecte.',
    en: 'The split across the three scopes drives the strategy. A Scope 2-dominated profile is a '
      + 'matter of electricity sourcing, addressed through contracts or on-site generation; a '
      + 'Scope 1-dominated profile concerns processes and refrigerants, addressed through '
      + 'industrial investment; a Scope 3-dominated profile shifts the effort to purchasing and '
      + 'logistics, where the company holds only indirect influence.'
  },
  'p.s1.concentration': {
    fr: 'Plus ce nombre est faible, plus la décarbonation se joue sur un petit nombre de '
      + 'décisions — et plus la fiabilité de ces quelques données d\'entrée devient critique.',
    en: 'The lower this number, the more decarbonisation rests on a handful of decisions — and '
      + 'the more critical the reliability of those few input data becomes.'
  },
  'p.s1.ecartNote': {
    fr: 'Un écart peut venir de l\'activité comme de la collecte : un poste nouvellement '
      + 'renseigné fait monter le total sans qu\'aucune émission n\'ait augmenté. Les deux causes '
      + 'se distinguent en rapprochant l\'écart du nombre de lignes de mesure.',
    en: 'A variance may stem from activity or from collection: a newly reported source raises the '
      + 'total without any emission having increased. The two causes are told apart by comparing '
      + 'the variance with the number of measurement records.'
  },
  'p.s1.aucunAnterieur': {
    fr: 'Aucun exercice antérieur n\'est chiffré sur ce périmètre : la variation ne peut pas être '
      + 'établie, et cet exercice fait office d\'année de référence.',
    en: 'No prior reporting year is quantified for this boundary: no variance can be established, '
      + 'and this year serves as the base year.'
  },

  // ---------- PARAGRAPHES : SECTION 2 ----------
  'p.s2.principes': {
    fr: 'Le GHG Protocol impose de fixer d\'abord un périmètre organisationnel — quelles entités '
      + 'entrent à l\'inventaire — avant tout périmètre opérationnel. Deux approches s\'offrent, '
      + 'et elles ne donnent pas le même total.',
    en: 'The GHG Protocol requires an organisational boundary — which entities enter the '
      + 'inventory — to be set before any operational boundary. Two approaches are available, and '
      + 'they do not yield the same total.'
  },
  'p.s2.operationnel': {
    fr: '100 % des émissions des installations dont l\'entreprise dirige l\'exploitation.',
    en: '100 % of emissions from facilities whose operations the company directs.'
  },
  'p.s2.operationnelC': {
    fr: 'Retenue ici. Elle épouse le pouvoir d\'agir : on ne déclare que ce sur quoi on peut '
      + 'décider d\'investir ou de changer de procédé.',
    en: 'Selected here. It follows the power to act: only what the company can decide to invest '
      + 'in or change is reported.'
  },
  'p.s2.financier': {
    fr: '100 % des émissions des entités dont l\'entreprise porte les risques et bénéfices.',
    en: '100 % of emissions from entities whose risks and rewards the company bears.'
  },
  'p.s2.financierC': {
    fr: 'Alignée sur la consolidation comptable, mais elle intègre des sites qu\'on ne pilote pas '
      + 'et exclut des sites qu\'on exploite.',
    en: 'Aligned with financial consolidation, but it includes sites the company does not run and '
      + 'excludes sites it operates.'
  },
  'p.s2.capital': { fr: 'Émissions au prorata de la détention.', en: 'Emissions pro rata to ownership.' },
  'p.s2.capitalC': {
    fr: 'Réservée aux portefeuilles de participations ; peu lisible pour un industriel exploitant '
      + 'ses propres usines.',
    en: 'Reserved for investment portfolios; poorly suited to a manufacturer running its own plants.'
  },
  'p.s2.stabilite': {
    fr: 'Le choix doit rester stable d\'un exercice à l\'autre : en changer modifie le total sans '
      + 'qu\'aucune émission n\'ait bougé, et rend toute trajectoire de réduction incomparable.',
    en: 'The choice must remain stable from year to year: changing it alters the total without any '
      + 'emission having moved, and renders any reduction pathway incomparable.'
  },
  'p.s2.consolidation1': {
    fr: 'Le serveur n\'agrégeant les mesures que par société, leurs bilans sont chargés '
      + 'séparément puis fusionnés.',
    en: 'Since the server aggregates measurements by entity only, their inventories are loaded '
      + 'separately then merged.'
  },
  'p.s2.consolidation2': {
    fr: 'Les émissions s\'additionnent, les quotes-parts se recalculent. Sommer les pourcentages '
      + 'de plusieurs bilans produirait des parts supérieures à 100 % ; elles sont donc établies '
      + 'à nouveau sur les totaux consolidés. Un même poste porté par plusieurs sociétés apparaît '
      + 'en une seule ligne, dont le nombre de mesures est cumulé.',
    en: 'Emissions add up, shares are recalculated. Summing percentages from several inventories '
      + 'would produce shares above 100 %; they are therefore re-established on the consolidated '
      + 'totals. A source reported by several entities appears as a single line, with its record '
      + 'count aggregated.'
  },
  'p.s2.serveurMuet': {
    fr: '⚠ Une société au moins du périmètre n\'a pu être chiffrée par le serveur : son apport '
      + 'repose sur les seuls relevés du navigateur. Le total consolidé est donc incomplet.',
    en: '⚠ At least one entity in the boundary could not be quantified by the server: its '
      + 'contribution rests on browser-side records alone. The consolidated total is therefore '
      + 'incomplete.'
  },
  'p.s2.aucunPays': {
    fr: 'Aucun pays n\'est retenu : le périmètre suit le sélecteur de l\'en-tête et aucune fusion '
      + 'multi-sociétés n\'est appliquée.',
    en: 'No country is selected: the boundary follows the header selector and no multi-entity '
      + 'merge is applied.'
  },
  'p.s2.maturite1': {
    fr: 'Toutes les données d\'un inventaire ne se valent pas. Ce qui distingue une mesure '
      + 'vérifiable d\'une estimation n\'est pas sa précision affichée mais sa traçabilité : la '
      + 'capacité d\'un tiers à remonter du chiffre agrégé à la pièce justificative.',
    en: 'Not all inventory data are equal. What distinguishes a verifiable measurement from an '
      + 'estimate is not its displayed precision but its traceability: a third party\'s ability to '
      + 'trace the aggregated figure back to the supporting document.'
  },
  'p.s2.maturite2': {
    fr: 'Une part élevée en « Saisie écran » n\'invalide pas l\'inventaire, mais elle en fixe la '
      + 'limite : ces relevés vivent dans le navigateur et ne peuvent pas être produits devant un '
      + 'vérificateur. Les soumettre au serveur est la première étape de la fiabilisation.',
    en: 'A high share of "Manual entry" does not invalidate the inventory, but it sets its limit: '
      + 'those records live in the browser and cannot be produced before a verifier. Submitting '
      + 'them to the server is the first step towards reliability.'
  },
  'p.s2.provenance': {
    fr: 'La provenance qualifie la fiabilité : une mesure issue de la base de données est '
      + 'vérifiable, un relevé saisi à l\'écran ne l\'est pas encore. Les incertitudes propres aux '
      + 'facteurs figurent en section 3.',
    en: 'Data origin qualifies reliability: a measurement from the database is verifiable, a '
      + 'manually entered record is not yet. Uncertainties attached to the factors appear in '
      + 'section 3.'
  },
  'p.s2.nonCollecte': {
    fr: 'Poste non collecté : l\'empreinte est minorée d\'autant.',
    en: 'Source not collected: the footprint is understated accordingly.'
  },

  // ---------- PARAGRAPHES : SECTION 3 ----------
  'p.s3.prg1': {
    fr: 'Les gaz à effet de serre ne réchauffent pas à la même intensité, ni pendant la même '
      + 'durée. Le potentiel de réchauffement global (PRG) ramène chacun d\'eux à une quantité '
      + 'équivalente de CO₂, sur un horizon conventionnel de 100 ans : c\'est ce qui permet '
      + 'd\'additionner en une seule unité, la tonne d\'équivalent CO₂, des rejets de nature '
      + 'entièrement différente.',
    en: 'Greenhouse gases do not warm with the same intensity, nor for the same duration. The '
      + 'global warming potential (GWP) restates each of them as an equivalent quantity of CO₂ '
      + 'over a conventional 100-year horizon: this is what allows emissions of entirely '
      + 'different natures to be added in a single unit, the tonne of CO₂ equivalent.'
  },
  'p.s3.prg2': {
    fr: 'Les valeurs retenues ici sont celles du cinquième rapport d\'évaluation du GIEC (AR5), '
      + 'référentiel usuel du reporting d\'entreprise. Le sixième rapport (AR6) les révise à la '
      + 'hausse pour plusieurs gaz — le HFC-134a passe de 1 300 à 1 526. Changer de référentiel '
      + 'en cours de trajectoire modifie le total sans qu\'aucune émission n\'ait varié : le '
      + 'référentiel doit donc être déclaré, et rester stable.',
    en: 'The values applied here are those of the IPCC Fifth Assessment Report (AR5), the '
      + 'customary framework for corporate reporting. The Sixth Report (AR6) revises several of '
      + 'them upwards — HFC-134a rises from 1,300 to 1,526. Changing framework mid-pathway alters '
      + 'the total without any emission having varied: the framework must therefore be declared, '
      + 'and remain stable.'
  },
  'p.s3.prg3': {
    fr: 'L\'horizon de 100 ans est une convention, non une vérité physique. Le méthane, dont la '
      + 'durée de vie atmosphérique est d\'environ douze ans, pèse 28 fois le CO₂ à cet horizon '
      + 'mais davantage sur vingt ans. Un inventaire qui viserait le pic de température à court '
      + 'terme retiendrait un autre horizon.',
    en: 'The 100-year horizon is a convention, not a physical truth. Methane, with an atmospheric '
      + 'lifetime of about twelve years, weighs 28 times CO₂ at that horizon but more over twenty '
      + 'years. An inventory targeting the near-term temperature peak would adopt a different '
      + 'horizon.'
  },
  'p.s3.prgNote': {
    fr: 'Un kilogramme de méthane compte pour 28 kilogrammes d\'équivalent CO₂, un kilogramme de '
      + 'R-404A pour 3 943. C\'est ce qui explique qu\'une fuite de fluide frigorigène de quelques '
      + 'kilogrammes pèse davantage qu\'une tonne de carburant.',
    en: 'One kilogram of methane counts as 28 kilograms of CO₂ equivalent, one kilogram of R-404A '
      + 'as 3,943. This is why a refrigerant leak of a few kilograms weighs more than a tonne of '
      + 'fuel.'
  },
  'p.s3.gazAbsent1': {
    fr: 'Ventilation par gaz non disponible. Le référentiel expose le champ gasDetails pour '
      + 'chaque facteur, mais aucun des facteurs chargés ne le renseigne à ce jour.',
    en: 'Breakdown by gas unavailable. The referential exposes the gasDetails field for each '
      + 'factor, but none of the loaded factors populates it to date.'
  },
  'p.s3.gazAbsent2': {
    fr: 'L\'empreinte est donc restituée en équivalent CO₂ agrégé, sans distinguer la part du '
      + 'CO₂, du CH₄ et du N₂O. Cette section se remplira d\'elle-même dès que le détail par gaz '
      + 'sera saisi au référentiel — aucune répartition n\'est estimée ici, une ventilation '
      + 'supposée n\'étant pas vérifiable.',
    en: 'The footprint is therefore reported as aggregated CO₂ equivalent, without separating the '
      + 'shares of CO₂, CH₄ and N₂O. This section will populate itself once the per-gas detail is '
      + 'entered in the referential — no split is estimated here, an assumed breakdown not being '
      + 'verifiable.'
  },
  'p.s3.mix1': {
    fr: 'Le facteur d\'émission de l\'électricité n\'est pas une propriété du kilowattheure mais '
      + 'du parc qui l\'a produit. Un réseau à dominante thermique fossile émet plusieurs '
      + 'centaines de grammes de CO₂ par kilowattheure ; un réseau à forte composante nucléaire '
      + 'ou hydraulique se situe un ordre de grandeur en dessous. Consommer la même quantité '
      + 'd\'électricité sur deux implantations ne produit donc pas la même empreinte, et c\'est la '
      + 'raison pour laquelle ce rapport se lit par pays.',
    en: 'The emission factor of electricity is not a property of the kilowatt-hour but of the '
      + 'fleet that produced it. A grid dominated by fossil thermal generation emits several '
      + 'hundred grams of CO₂ per kilowatt-hour; a grid with a strong nuclear or hydro component '
      + 'sits an order of magnitude below. Consuming the same amount of electricity at two '
      + 'locations therefore does not produce the same footprint, which is why this report is read '
      + 'by country.'
  },
  'p.s3.mix2': {
    fr: 'Méthodologie d\'allocation. Chaque mesure est rattachée à une source d\'émission du '
      + 'référentiel, qui porte elle-même son facteur, son unité de dénominateur et sa base '
      + 'documentaire. L\'émission est le produit de la quantité — ramenée à l\'unité du facteur — '
      + 'par la valeur du facteur. Aucune conversion n\'est supposée : lorsque l\'unité saisie et '
      + 'celle du facteur ne sont pas commensurables, la mesure est rejetée plutôt que convertie '
      + 'au jugé.',
    en: 'Allocation methodology. Each measurement is attached to an emission source in the '
      + 'referential, which itself carries its factor, its denominator unit and its reference '
      + 'database. The emission is the product of the quantity — restated in the factor\'s unit — '
      + 'by the factor value. No conversion is assumed: where the entered unit and the factor unit '
      + 'are not commensurable, the measurement is rejected rather than converted by guesswork.'
  },
  'p.s3.mix3': {
    fr: 'Hiérarchie des sources. Un facteur national propre au pays d\'implantation prime sur un '
      + 'facteur régional, lui-même préféré à une moyenne internationale. À défaut de facteur '
      + 'local, une base générique est appliquée et la substitution est signalée : elle constitue '
      + 'une source d\'incertitude qui doit rester visible plutôt que d\'être absorbée dans le '
      + 'chiffre.',
    en: 'Source hierarchy. A national factor specific to the country of operation takes precedence '
      + 'over a regional factor, itself preferred to an international average. Failing a local '
      + 'factor, a generic database is applied and the substitution is flagged: it is a source of '
      + 'uncertainty that must remain visible rather than absorbed into the figure.'
  },
  'p.s3.mix4': {
    fr: 'Méthode retenue pour le Scope 2 : location-based — le facteur moyen du réseau. La '
      + 'méthode market-based, fondée sur les instruments contractuels (garanties d\'origine, '
      + 'contrats d\'achat direct), n\'est pas applicable en l\'absence de tels instruments sur le '
      + 'périmètre. Le GHG Protocol impose leur double publication dès qu\'ils existent.',
    en: 'Method applied for Scope 2: location-based — the average grid factor. The market-based '
      + 'method, founded on contractual instruments (guarantees of origin, power purchase '
      + 'agreements), is not applicable in the absence of such instruments within the boundary. '
      + 'The GHG Protocol requires dual reporting as soon as they exist.'
  },
  'p.s3.mixNote': {
    fr: 'Le facteur d\'électricité dépend du mix national : le même kilowattheure consommé dans '
      + 'deux pays ne porte pas la même empreinte. C\'est la raison pour laquelle ce rapport se '
      + 'lit par implantation.',
    en: 'The electricity factor depends on the national mix: the same kilowatt-hour consumed in '
      + 'two countries does not carry the same footprint. This is why this report is read by '
      + 'location.'
  },
  'p.s3.aucunFacteur': {
    fr: 'Aucun facteur énergétique n\'est chargé depuis le référentiel.',
    en: 'No energy factor is loaded from the referential.'
  },

  // ---------- PARAGRAPHES : SECTION 4 ----------
  'p.s4.intro': {
    fr: 'Les tableaux de détail figurent aux pages précédentes. Cette section les commente : ce '
      + 'que chaque scope recouvre, ce que ses chiffres établissent sur ce périmètre, et ce '
      + 'qu\'ils ne permettent pas de conclure.',
    en: 'The detailed tables appear on the preceding pages. This section comments on them: what '
      + 'each scope covers, what its figures establish for this boundary, and what they do not '
      + 'allow one to conclude.'
  },
  'p.s4.s1a': {
    fr: 'Le Scope 1 réunit ce que l\'entreprise émet elle-même : la combustion fixe des '
      + 'chaudières et des fours, la combustion mobile de la flotte, les émissions de procédé, et '
      + 'les émissions fugitives — les fuites de fluides frigorigènes.',
    en: 'Scope 1 gathers what the company emits itself: stationary combustion from boilers and '
      + 'furnaces, mobile combustion from the fleet, process emissions, and fugitive emissions — '
      + 'refrigerant leaks.'
  },
  'p.s4.s1b': {
    fr: 'Les fugitives méritent une attention propre. Une fuite de quelques kilogrammes de fluide '
      + 'pèse davantage qu\'une tonne de gazole, un R-404A valant 3 943 fois le CO₂ à masse '
      + 'égale. Elles échappent en outre à toute facture : elles ne se constatent qu\'au registre '
      + 'de maintenance, à la recharge. Un Scope 1 sans ligne de fugitives sur un site climatisé '
      + 'signale une collecte incomplète, non une absence de fuite.',
    en: 'Fugitive emissions deserve particular attention. A leak of a few kilograms of refrigerant '
      + 'weighs more than a tonne of diesel, R-404A being worth 3,943 times CO₂ at equal mass. '
      + 'They also escape any invoice: they are observed only in the maintenance log, at '
      + 'recharging. A Scope 1 without a fugitive line on an air-conditioned site signals '
      + 'incomplete collection, not the absence of a leak.'
  },
  'p.s4.s2a': {
    fr: 'Le Scope 2 couvre l\'énergie achetée puis consommée : électricité, vapeur, chaleur, '
      + 'froid. Les émissions ont lieu chez le producteur, mais elles sont imputées au '
      + 'consommateur, seul en mesure d\'agir sur la quantité consommée et sur le contrat '
      + 'd\'approvisionnement.',
    en: 'Scope 2 covers energy purchased then consumed: electricity, steam, heat, cooling. The '
      + 'emissions occur at the producer, but they are charged to the consumer, the only party '
      + 'able to act on the quantity consumed and on the supply contract.'
  },
  'p.s4.s2b': {
    fr: 'Trois leviers s\'y appliquent, d\'effet croissant et de coût croissant : réduire la '
      + 'consommation (efficacité des utilités, air comprimé, éclairage, récupération de '
      + 'chaleur), produire sur site (photovoltaïque en toiture), puis contracter une électricité '
      + 'd\'origine renouvelable — ce dernier levier n\'agissant que sur la restitution '
      + 'market-based et laissant le chiffre location-based inchangé.',
    en: 'Three levers apply, of increasing effect and increasing cost: reduce consumption (utility '
      + 'efficiency, compressed air, lighting, heat recovery), generate on site (rooftop '
      + 'photovoltaics), then contract renewable electricity — this last lever acting only on the '
      + 'market-based figure and leaving the location-based figure unchanged.'
  },
  'p.s4.s3a': {
    fr: 'Le Scope 3 compte quinze catégories, huit en amont et sept en aval. C\'est habituellement '
      + 'le scope le plus lourd d\'un industriel, et le moins bien mesuré : les données '
      + 'n\'appartiennent pas à l\'entreprise mais à ses fournisseurs, ses transporteurs et ses '
      + 'clients.',
    en: 'Scope 3 comprises fifteen categories, eight upstream and seven downstream. It is usually '
      + 'the heaviest scope for a manufacturer, and the least well measured: the data belong not '
      + 'to the company but to its suppliers, carriers and customers.'
  },
  'p.s4.cat.achats': { fr: 'Biens et services achetés', en: 'Purchased goods and services' },
  'p.s4.cat.achatsQ': {
    fr: 'Empreinte de fabrication des intrants : acier, médias filtrants, résines, plastiques, '
      + 'emballages.',
    en: 'Manufacturing footprint of inputs: steel, filter media, resins, plastics, packaging.'
  },
  'p.s4.cat.achatsD': {
    fr: 'Souvent estimée en approche monétaire, dont la précision est structurellement limitée. '
      + 'La bascule vers des facteurs physiques, puis vers des données primaires fournisseurs, est '
      + 'le seul chemin de fiabilisation.',
    en: 'Often estimated using a spend-based approach, whose precision is structurally limited. '
      + 'Shifting to physical factors, then to primary supplier data, is the only path to '
      + 'reliability.'
  },
  'p.s4.cat.amont': { fr: 'Transport et distribution amont', en: 'Upstream transport and distribution' },
  'p.s4.cat.amontQ': {
    fr: 'Fret entrant des matières et composants, du fournisseur à l\'usine.',
    en: 'Inbound freight of materials and components, from supplier to plant.'
  },
  'p.s4.cat.amontD': {
    fr: 'Exige des tonnes·kilomètres par mode. Un poste de fret très supérieur à celui des biens '
      + 'qu\'il transporte trahit une erreur d\'unité : le fret représente usuellement 5 à 15 % de '
      + 'l\'empreinte des intrants déplacés.',
    en: 'Requires tonne-kilometres by mode. A freight figure far above that of the goods it '
      + 'carries betrays a unit error: freight usually accounts for 5 to 15 % of the footprint of '
      + 'the inputs moved.'
  },
  'p.s4.cat.aval': { fr: 'Transport et distribution aval', en: 'Downstream transport and distribution' },
  'p.s4.cat.avalQ': {
    fr: 'Distribution des produits finis vers les clients et les marchés d\'export.',
    en: 'Distribution of finished goods to customers and export markets.'
  },
  'p.s4.cat.avalD': {
    fr: 'La frontière avec l\'amont dépend de l\'incoterm : c\'est lui qui détermine qui porte le '
      + 'transport, et donc dans quelle catégorie il tombe.',
    en: 'The boundary with upstream depends on the incoterm: it determines who bears the '
      + 'transport, and therefore which category it falls into.'
  },
  'p.s4.cat.voyages': { fr: 'Déplacements professionnels', en: 'Business travel' },
  'p.s4.cat.voyagesQ': {
    fr: 'Missions par avion, train et voiture ; hôtellerie associée.',
    en: 'Trips by air, rail and car; associated accommodation.'
  },
  'p.s4.cat.voyagesD': {
    fr: 'Poste bien tracé par les notes de frais, mais souvent modeste : il attire une attention '
      + 'disproportionnée à son poids réel.',
    en: 'Well traced through expense claims, but often modest: it attracts attention '
      + 'disproportionate to its actual weight.'
  },
  'p.s4.cat.dechets': { fr: 'Déchets d\'exploitation', en: 'Operational waste' },
  'p.s4.cat.dechetsQ': {
    fr: 'Traitement des déchets produits par les sites, par filière.',
    en: 'Treatment of waste produced by the sites, by stream.'
  },
  'p.s4.cat.dechetsD': {
    fr: 'L\'empreinte dépend de la filière — enfouissement, incinération, recyclage — davantage '
      + 'que du tonnage.',
    en: 'The footprint depends on the stream — landfill, incineration, recycling — more than on '
      + 'the tonnage.'
  },
  'p.s4.cat.finVie': { fr: 'Fin de vie des produits vendus', en: 'End-of-life of sold products' },
  'p.s4.cat.finVieQ': {
    fr: 'Traitement des produits une fois usagés.',
    en: 'Treatment of products once used.'
  },
  'p.s4.cat.finVieD': {
    fr: 'Critique pour un fabricant de consommables : un filtre est remplacé périodiquement, sa '
      + 'fin de vie se répète donc à chaque cycle et se multiplie par le volume vendu.',
    en: 'Critical for a consumables manufacturer: a filter is replaced periodically, so its '
      + 'end-of-life recurs at each cycle and multiplies by the volume sold.'
  },
  'th.recouvre': { fr: 'Ce qu\'elle recouvre', en: 'What it covers' },
  'th.difficulte': { fr: 'Difficulté propre', en: 'Specific difficulty' },

  // ---------- PARAGRAPHES : SECTION 5 ----------
  'p.s5.intro': {
    fr: 'Une empreinte absolue ne dit rien de la performance : elle croît avec l\'activité. Les '
      + 'ratios d\'intensité rapportent l\'empreinte à un dénominateur physique ou économique et '
      + 'permettent seuls de comparer deux exercices, deux sites, ou deux entreprises. Chaque '
      + 'dénominateur répond à une question distincte.',
    en: 'An absolute footprint says nothing about performance: it grows with activity. Intensity '
      + 'ratios relate the footprint to a physical or economic denominator and alone allow two '
      + 'years, two sites or two companies to be compared. Each denominator answers a distinct '
      + 'question.'
  },
  'th.question': { fr: 'Question à laquelle il répond', en: 'Question it answers' },
  'th.limite': { fr: 'Limite', en: 'Limitation' },
  'p.s5.parUnite': { fr: 'Par unité produite', en: 'Per unit produced' },
  'p.s5.parUniteQ': {
    fr: 'L\'efficacité carbone du procédé industriel.',
    en: 'The carbon efficiency of the industrial process.'
  },
  'p.s5.parUniteL': {
    fr: 'Le plus robuste, car indépendant des prix et des effectifs. Suppose des produits '
      + 'homogènes : un mélange de références de masses très différentes le rend trompeur.',
    en: 'The most robust, being independent of prices and headcount. Assumes homogeneous products: '
      + 'a mix of references with very different masses makes it misleading.'
  },
  'p.s5.parCa': { fr: 'Par chiffre d\'affaires', en: 'Per revenue' },
  'p.s5.parCaQ': {
    fr: 'L\'intensité carbone du modèle économique.',
    en: 'The carbon intensity of the business model.'
  },
  'p.s5.parCaL': {
    fr: 'Sensible aux prix et au taux de change : une hausse tarifaire améliore le ratio sans '
      + 'qu\'aucune tonne n\'ait été évitée.',
    en: 'Sensitive to prices and exchange rates: a price increase improves the ratio without a '
      + 'single tonne having been avoided.'
  },
  'p.s5.parFte': { fr: 'Par employé (FTE)', en: 'Per employee (FTE)' },
  'p.s5.parFteQ': {
    fr: 'L\'empreinte rapportée à l\'organisation.',
    en: 'The footprint relative to the organisation.'
  },
  'p.s5.parFteL': {
    fr: 'Utile en comparaison sectorielle, mais l\'externalisation le fait mécaniquement chuter en '
      + 'transférant les émissions au Scope 3.',
    en: 'Useful for sector comparison, but outsourcing mechanically lowers it by transferring '
      + 'emissions to Scope 3.'
  },
  'p.s5.ratiosPartiels': {
    fr: 'Ratios partiellement calculables. Les dénominateurs — effectif, production, chiffre '
      + 'd\'affaires — sont tenus par l\'écran « Données d\'Activité & KPI » et non saisis dans le '
      + 'rapport. Un ratio sans dénominateur n\'est pas estimé : il est déclaré non calculable, '
      + 'plutôt que rempli d\'une valeur approchée.',
    en: 'Ratios only partly computable. The denominators — headcount, production, revenue — are '
      + 'held by the "Activity Data & KPI" screen and not entered in the report. A ratio without a '
      + 'denominator is not estimated: it is declared not computable, rather than filled with an '
      + 'approximate value.'
  },
  'p.s5.benchNote': {
    fr: 'Les ordres de grandeur cités relèvent de la pratique sectorielle de l\'équipementier '
      + 'automobile et de la transformation plastique. Ce ne sont pas des données auditées : ils '
      + 'servent de test de plausibilité, non de classement.',
    en: 'The orders of magnitude quoted reflect sector practice for automotive suppliers and '
      + 'plastics processing. These are not audited data: they serve as a plausibility test, not a '
      + 'ranking.'
  },
  'th.ordreGrandeur': {
    fr: 'Ordre de grandeur industriel indicatif',
    en: 'Indicative industrial order of magnitude'
  },
  'th.lecture': { fr: 'Lecture', en: 'Reading' },
  'p.s5.cbam1': {
    fr: 'Le mécanisme d\'ajustement carbone aux frontières de l\'Union européenne (CBAM, ou MACF '
      + 'en français) impose à l\'importateur de déclarer les émissions incorporées dans certains '
      + 'produits, puis d\'acquitter la différence entre le prix du carbone au pays de production '
      + 'et celui du marché européen. Il vise d\'abord les secteurs intensifs — fer, acier, '
      + 'aluminium, ciment, engrais, hydrogène, électricité — et s\'étend progressivement.',
    en: 'The European Union\'s Carbon Border Adjustment Mechanism (CBAM) requires the importer to '
      + 'declare the emissions embedded in certain products, then to pay the difference between '
      + 'the carbon price in the country of production and that of the European market. It targets '
      + 'intensive sectors first — iron, steel, aluminium, cement, fertilisers, hydrogen, '
      + 'electricity — and is expanding progressively.'
  },
  'p.s5.cbam2': {
    fr: 'Pour un exportateur vers l\'Union, la conséquence est directe : l\'empreinte devient une '
      + 'composante du prix de revient. Un inventaire non vérifiable expose au surcroît à '
      + 'l\'application de valeurs par défaut, généralement défavorables, faute de pouvoir '
      + 'justifier ses propres chiffres.',
    en: 'For an exporter to the Union, the consequence is direct: the footprint becomes a '
      + 'component of cost price. An unverifiable inventory further exposes the company to default '
      + 'values, generally unfavourable, for want of being able to substantiate its own figures.'
  },
  'p.s5.cbamNote': {
    fr: 'Ce montant est une exposition, non une dette. Il indique l\'ordre de grandeur de ce '
      + 'qu\'une tarification intégrale du périmètre représenterait au prix retenu. Il ne tient '
      + 'compte ni des quotas gratuits, ni du périmètre sectoriel effectif du mécanisme, ni du '
      + 'prix du carbone déjà acquitté au pays de production. Le prix retenu est un paramètre : '
      + 'recalculer avec une autre hypothèse ne demande qu\'une multiplication.',
    en: 'This amount is an exposure, not a liability. It indicates the order of magnitude of what '
      + 'full pricing of the boundary would represent at the price applied. It accounts for '
      + 'neither free allowances, nor the mechanism\'s effective sector scope, nor the carbon price '
      + 'already paid in the country of production. The price applied is a parameter: recalculating '
      + 'under another assumption requires only a multiplication.'
  },
  'p.s5.assiette': { fr: 'Assiette retenue', en: 'Basis applied' },
  'p.s5.prixApplique': { fr: 'Prix du carbone appliqué', en: 'Carbon price applied' },
  'p.s5.expoTheorique': { fr: 'Exposition théorique', en: 'Theoretical exposure' },

  // ---------- PARAGRAPHES : SECTION 6 ----------
  'p.s6.intro': {
    fr: 'Une trajectoire de réduction n\'est opposable que si elle part d\'une année de référence '
      + 'vérifiée. Tant que celle-ci n\'est pas auditée, un engagement exprimé en pourcentage ne '
      + 'se contrôle pas : c\'est pourquoi la fiabilisation de l\'inventaire figure ci-dessous '
      + 'comme premier levier, et non comme préalable administratif.',
    en: 'A reduction pathway is enforceable only if it starts from a verified base year. Until '
      + 'that year is audited, a commitment expressed as a percentage cannot be checked: this is '
      + 'why making the inventory reliable appears below as the first lever, and not as an '
      + 'administrative formality.'
  },
  'p.s6.objectifRetenu': { fr: 'Objectif retenu', en: 'Target applied' },
  'p.s6.anneeBase': { fr: 'Année de base', en: 'Base year' },
  'p.s6.cible': { fr: 'Cible', en: 'Target' },
  'p.s6.exerciceConsulte': { fr: 'Exercice consulté', en: 'Year under review' },
  'p.s6.ecartCible': { fr: 'Écart à la cible', en: 'Gap to target' },
  'p.s6.effortRealise': { fr: 'Effort réalisé', en: 'Effort achieved' },
  'p.s6.horizonDe': { fr: 'à l\'horizon', en: 'by' },
  'p.s6.pasTrajectoire': {
    fr: 'La trajectoire exige une année de base chiffrée et un objectif : renseignez-les au '
      + 'chapitre 4 du rapport normé.',
    en: 'The pathway requires a quantified base year and a target: enter them in chapter 4 of the '
      + 'compliance report.'
  },
  'p.s6.posteVise': { fr: 'Poste visé', en: 'Source targeted' },
  'p.s6.actions2028': { fr: 'Actions à 2028', en: 'Actions by 2028' },
  'p.s6.actions2030': { fr: 'Actions à 2030', en: 'Actions by 2030' },
  'p.s6.impactAttendu': { fr: 'Impact attendu', en: 'Expected impact' },
  'p.s6.investissement': { fr: 'Investissement', en: 'Investment' },

  'p.s6.l1.titre': { fr: 'Levier 1 — Efficacité énergétique', en: 'Lever 1 — Energy efficiency' },
  'p.s6.l1.poste': {
    fr: 'électricité achetée, utilités industrielles (Scope 2).',
    en: 'purchased electricity, industrial utilities (Scope 2).'
  },
  'p.s6.l1.a2028': {
    fr: 'audit énergétique réglementaire des trois sites ; comptage divisionnaire par atelier, '
      + 'sans lequel aucune économie n\'est attribuable ; variation de vitesse sur les moteurs de '
      + 'ventilation et de pompage ; chasse aux fuites d\'air comprimé ; relamping LED des halls '
      + 'de production.',
    en: 'statutory energy audit of the three sites; sub-metering by workshop, without which no '
      + 'saving is attributable; variable-speed drives on ventilation and pumping motors; '
      + 'compressed-air leak hunting; LED relamping of production halls.'
  },
  'p.s6.l1.a2030': {
    fr: 'récupération de chaleur sur les compresseurs et les groupes froids ; pilotage centralisé '
      + 'des utilités ; renouvellement des équipements les moins performants au fil des '
      + 'amortissements.',
    en: 'heat recovery from compressors and chillers; centralised utility control; replacement of '
      + 'the least efficient equipment as it is written down.'
  },
  'p.s6.l1.impact': {
    fr: '−10 à −20 % du Scope 2. Investissement : modéré, retour généralement inférieur à trois '
      + 'ans sur la part comptage et air comprimé.',
    en: '−10 to −20 % of Scope 2. Investment: moderate, payback generally under three years on the '
      + 'metering and compressed-air portion.'
  },
  'p.s6.l1.note': {
    fr: 'Ce levier est le seul dont le gain est acquis quel que soit le mix électrique futur : '
      + 'une consommation évitée ne dépend d\'aucun contrat.',
    en: 'This is the only lever whose gain holds whatever the future electricity mix: consumption '
      + 'avoided depends on no contract.'
  },

  'p.s6.l2.titre': { fr: 'Levier 2 — Énergies renouvelables', en: 'Lever 2 — Renewable energy' },
  'p.s6.l2.poste': { fr: 'électricité achetée (Scope 2).', en: 'purchased electricity (Scope 2).' },
  'p.s6.l2.a2028': {
    fr: 'étude de portance des toitures et dimensionnement photovoltaïque en autoconsommation ; '
      + 'première tranche sur le site à la plus forte consommation diurne, l\'autoconsommation '
      + 'valant d\'autant plus que la production coïncide avec la charge.',
    en: 'roof load-bearing study and photovoltaic sizing for self-consumption; first phase on the '
      + 'site with the highest daytime consumption, self-consumption being worth all the more when '
      + 'generation coincides with load.'
  },
  'p.s6.l2.a2030': {
    fr: 'extension aux autres sites ; contractualisation d\'un approvisionnement renouvelable '
      + '(contrat d\'achat direct ou garanties d\'origine), qui ouvre la publication market-based '
      + 'exigée par le GHG Protocol dès lors que de tels instruments existent.',
    en: 'extension to the other sites; contracting renewable supply (power purchase agreement or '
      + 'guarantees of origin), which opens the market-based reporting required by the GHG '
      + 'Protocol once such instruments exist.'
  },
  'p.s6.l2.impact': {
    fr: '−15 à −30 % du Scope 2 par l\'autoproduction, jusqu\'à −70 % du Scope 2 market-based par '
      + 'la contractualisation.',
    en: '−15 to −30 % of Scope 2 through self-generation, up to −70 % of market-based Scope 2 '
      + 'through contracting.'
  },
  'p.s6.l2.note': {
    fr: 'Distinction à tenir : l\'autoproduction réduit le chiffre location-based, la '
      + 'contractualisation ne modifie que le market-based. Les confondre conduit à annoncer deux '
      + 'fois la même réduction.',
    en: 'A distinction to hold: self-generation reduces the location-based figure, contracting '
      + 'alters only the market-based one. Confusing them leads to announcing the same reduction '
      + 'twice.'
  },

  'p.s6.l3.titre': { fr: 'Levier 3 — Achats bas-carbone', en: 'Lever 3 — Low-carbon purchasing' },
  'p.s6.l3.poste': {
    fr: 'biens et services achetés (Scope 3, catégorie 1).',
    en: 'purchased goods and services (Scope 3, category 1).'
  },
  'p.s6.l3.a2028': {
    fr: 'cartographie carbone du panel fournisseurs ; substitution des facteurs monétaires par '
      + 'des facteurs physiques, puis par des données primaires ; introduction d\'un critère '
      + 'carbone dans les appels d\'offres ; recours à l\'acier et aux plastiques recyclés là où '
      + 'les spécifications de filtration l\'autorisent.',
    en: 'carbon mapping of the supplier panel; replacing spend-based factors with physical '
      + 'factors, then with primary data; introducing a carbon criterion into tenders; use of '
      + 'recycled steel and plastics where filtration specifications allow.'
  },
  'p.s6.l3.a2030': {
    fr: 'engagement des fournisseurs représentant 80 % des achats sur une trajectoire propre ; '
      + 'éco-conception des références à plus fort volume, seul levier qui agisse simultanément '
      + 'sur les achats et sur la fin de vie.',
    en: 'commitment from suppliers representing 80 % of spend to their own pathway; eco-design of '
      + 'the highest-volume references, the only lever acting simultaneously on purchasing and on '
      + 'end-of-life.'
  },
  'p.s6.l3.impact': {
    fr: '−10 à −25 % de la catégorie 1, avec un effet d\'entraînement sur les catégories aval.',
    en: '−10 to −25 % of category 1, with a knock-on effect on downstream categories.'
  },
  'p.s6.l3.note': {
    fr: 'Levier d\'influence et non de décision : il s\'exerce par le contrat et la '
      + 'spécification, et son résultat dépend de tiers. Son rythme est donc plus lent que celui '
      + 'des leviers internes.',
    en: 'A lever of influence rather than decision: it operates through contract and '
      + 'specification, and its outcome depends on third parties. Its pace is therefore slower '
      + 'than that of internal levers.'
  },

  'p.s6.l4.titre': { fr: 'Levier 4 — Logistique', en: 'Lever 4 — Logistics' },
  'p.s6.l4.poste': {
    fr: 'transport amont et aval (Scope 3, catégories 4 et 9).',
    en: 'upstream and downstream transport (Scope 3, categories 4 and 9).'
  },
  'p.s6.l4.a2028': {
    fr: 'mesure des tonnes·kilomètres par mode, préalable à toute optimisation ; amélioration du '
      + 'taux de remplissage ; massification des expéditions ; réduction du fret aérien, dont le '
      + 'facteur dépasse d\'un ordre de grandeur celui du maritime.',
    en: 'measurement of tonne-kilometres by mode, a prerequisite to any optimisation; improved '
      + 'load factor; consolidation of shipments; reduction of air freight, whose factor exceeds '
      + 'that of sea freight by an order of magnitude.'
  },
  'p.s6.l4.a2030': {
    fr: 'report modal du routier vers le ferroviaire et le maritime sur les flux longs ; sourcing '
      + 'régional sur les familles où le coût logistique carbone dépasse l\'écart de prix ; '
      + 'exigence progressive de carburants alternatifs auprès des transporteurs.',
    en: 'modal shift from road to rail and sea on long flows; regional sourcing for families where '
      + 'the logistics carbon cost exceeds the price gap; progressive requirement of alternative '
      + 'fuels from carriers.'
  },
  'p.s6.l4.impact': { fr: '−15 à −25 % des catégories de transport.', en: '−15 to −25 % of transport categories.' },
  'p.s6.l4.note': {
    fr: 'Le préalable est métrologique : sans tonnes·kilomètres par mode, aucune des actions '
      + 'ci-dessus n\'est chiffrable, et l\'effet du report modal reste invérifiable.',
    en: 'The prerequisite is metrological: without tonne-kilometres by mode, none of the above '
      + 'actions can be quantified, and the effect of modal shift remains unverifiable.'
  },

  'p.s6.condition1': {
    fr: 'Condition préalable. Un objectif SBTi s\'exprime en pourcentage d\'une année de '
      + 'référence : tant que celle-ci n\'est pas auditée, aucun engagement n\'est opposable. La '
      + 'fiabilisation de l\'inventaire est donc le premier levier, non une étape préparatoire.',
    en: 'Prerequisite. An SBTi target is expressed as a percentage of a base year: until that year '
      + 'is audited, no commitment is enforceable. Making the inventory reliable is therefore the '
      + 'first lever, not a preparatory step.'
  },

  // ---------- PARAGRAPHES : ANNEXE A ----------
  'p.aA.fiches': {
    fr: 'Chaque poste de l\'inventaire repose sur une donnée d\'entrée, une source justificative '
      + 'et un contrôle. Cette annexe les nomme : c\'est ce tableau qu\'un vérificateur parcourt '
      + 'pour établir si un chiffre est reproductible.',
    en: 'Each inventory source rests on an input datum, a supporting document and a control. This '
      + 'appendix names them: this is the table a verifier reviews to establish whether a figure '
      + 'is reproducible.'
  },
  'p.aA.exclusions': {
    fr: 'Le principe d\'exhaustivité du GHG Protocol admet des exclusions, à la condition '
      + 'qu\'elles soient déclarées et justifiées. Une exclusion tacite est un défaut de '
      + 'conformité ; une exclusion documentée n\'en est pas un.',
    en: 'The GHG Protocol\'s completeness principle admits exclusions, provided they are declared '
      + 'and justified. A tacit exclusion is a compliance failure; a documented exclusion is not.'
  },
  'p.aA.tracabilite1': {
    fr: 'Les pièces justificatives sont conservées pendant la durée exigée par la norme de '
      + 'vérification retenue. Toute correction apportée à un exercice clos est enregistrée avec '
      + 'son motif : un total qui change sans trace de correction est un total invérifiable.',
    en: 'Supporting documents are retained for the period required by the verification standard '
      + 'applied. Any correction to a closed year is recorded with its reason: a total that changes '
      + 'without a trace of correction is an unverifiable total.'
  },
  'p.aA.tracabilite2': {
    fr: 'Les chiffres proviennent de l\'inventaire calculé et d\'aucune saisie manuelle : les '
      + 'commentaires sont amendables, les nombres ne le sont pas.',
    en: 'The figures come from the calculated inventory and from no manual entry: the commentary is '
      + 'amendable, the numbers are not.'
  },

  // ---------- ÉTATS VIDES ET NOTES DIVERSES ----------
  'vide.activite': {
    fr: 'Chiffre d\'affaires, production et effectif sont tenus dans l\'écran 🏢 Données '
      + 'd\'Activité & KPI : ils y sont saisis une fois et alimentent aussi bien l\'intensité du '
      + 'tableau de bord que les ratios de ce rapport.',
    en: 'Revenue, production and headcount are held in the 🏢 Activity Data & KPI screen: they are '
      + 'entered once there and feed both the dashboard intensity and the ratios in this report.'
  },
  'vide.objectif': {
    fr: 'Aucun objectif de réduction n\'est fixé pour ce périmètre : renseignez-le dans la '
      + 'configuration du rapport pour que l\'écart soit calculé.',
    en: 'No reduction target is set for this boundary: enter it in the report settings so the gap '
      + 'can be computed.'
  },
  'vide.graphique': {
    fr: 'Aucune émission chiffrée sur les catégories retenues : le graphique reste vide tant que '
      + 'la collecte n\'a pas alimenté le périmètre.',
    en: 'No quantified emissions across the reported categories: the chart stays empty until '
      + 'collection has fed the boundary.'
  },
  'vide.aucuneCategorie': {
    fr: 'Aucune catégorie n\'est retenue : cochez au moins un poste dans le panneau de '
      + 'configuration pour que le rapport comporte un détail.',
    en: 'No category is selected: tick at least one source in the settings panel so the report '
      + 'includes a breakdown.'
  },
  'vide.anneeReference': {
    fr: 'Aucune donnée n\'est disponible pour l\'année de référence indiquée : la comparaison '
      + 'historique reste vide plutôt que de reposer sur une empreinte supposée nulle.',
    en: 'No data is available for the stated base year: the historical comparison stays empty '
      + 'rather than resting on a footprint assumed to be zero.'
  },
  'vide.ecartCombler': {
    fr: 'Renseignez l\'objectif de réduction pour que l\'écart à combler soit calculé à partir de '
      + 'l\'empreinte constatée.',
    en: 'Enter the reduction target so the gap to close is computed from the recorded footprint.'
  },
  'p.s2.controleOp': {
    fr: 'Contrôle opérationnel — MISFAT exerce l\'autorité pleine sur les politiques '
      + 'd\'exploitation des sites retenus',
    en: 'Operational control — MISFAT holds full authority over the operating policies of the '
      + 'selected sites'
  },

  // ---------- NOM DU FICHIER PDF ----------
  'pdf.nom': { fr: 'Bilan-Carbone', en: 'Carbon_Footprint_Report' }
};

/**
 * Libellés venus des données, traduits par correspondance.
 *
 * <p>Les noms de scopes, de postes et de catégories ne sont pas écrits dans les
 * gabarits : ils viennent de la nomenclature interne et de la base. Ils ne
 * peuvent donc pas porter de clé de dictionnaire — c'est la valeur française
 * elle-même qui sert de clé.</p>
 *
 * <p>Un libellé absent de cette table est rendu tel quel. Une catégorie que la
 * base nomme d'une façon inattendue reste donc lisible en français plutôt que de
 * disparaître du rapport anglais.</p>
 */
export const LIBELLES_DONNEES: Record<string, string> = {

  // Scopes et leurs sous-titres
  'Émissions directes': 'Direct emissions',
  'Énergie indirecte': 'Indirect energy',
  'Chaîne de valeur — 15 catégories GHG Protocol': 'Value chain — 15 GHG Protocol categories',
  'Scope 1 · Direct': 'Scope 1 · Direct emissions',
  'Scope 2 · Énergie': 'Scope 2 · Energy',
  'Scope 3 · Chaîne de valeur': 'Scope 3 · Value chain',
  'Scope 1 — Directes': 'Scope 1 — Direct',
  'Scope 2 — Énergie': 'Scope 2 — Energy',
  'Scope 3 — Chaîne de valeur': 'Scope 3 — Value chain',

  // Postes de la nomenclature interne
  'Combustibles fossiles — installations fixes': 'Fossil fuels — stationary combustion',
  'Flotte de véhicules': 'Vehicle fleet',
  'Émissions fugitives — gaz réfrigérants': 'Fugitive emissions — refrigerant gases',
  'Procédés industriels': 'Industrial processes',
  'Électricité réseau achetée': 'Grid electricity purchased',
  'Vapeur achetée': 'Purchased steam',
  'Chaleur et froid urbains': 'District heating and cooling',
  'Biens et services achetés': 'Purchased goods and services',
  'Biens d\'équipement': 'Capital goods',
  'Activités liées à l\'énergie': 'Energy-related activities',
  'Transport et distribution en amont': 'Upstream transport and distribution',
  'Déchets générés en exploitation': 'Waste generated in operations',
  'Déplacements professionnels': 'Business travel',
  'Déplacements domicile — travail': 'Employee commuting',
  'Actifs loués en amont': 'Upstream leased assets',
  'Transport et distribution en aval': 'Downstream transport and distribution',
  'Transformation des produits vendus': 'Processing of sold products',
  'Utilisation des produits vendus': 'Use of sold products',
  'Fin de vie des produits vendus': 'End-of-life treatment of sold products',
  'Actifs loués en aval': 'Downstream leased assets',
  'Franchises': 'Franchises',
  'Investissements': 'Investments',

  // Catégories telles que la base les nomme
  'Émissions de réfrigérants': 'Refrigerant emissions',
  'Électricité achetée': 'Grid electricity purchased',
  'Combustion des véhicules': 'Vehicle combustion',
  'Combustion dans les usines': 'Combustion in plants',
  'Autre énergie': 'Other energy',
  'Transport en amont': 'Upstream transport',
  'Voyages d\'affaires': 'Business travel',
  'Déchets': 'Waste',
  'Réseaux de chaleur / Froid': 'District heating / cooling',

  // Libellés des ratios et des cartes
  'Empreinte totale': 'Total carbon footprint',
  'Ratio économique': 'Economic intensity ratio',
  'Ratio de production': 'Production intensity ratio',
  'Ratio social': 'Social intensity ratio',
  'Intensité par pièce produite': 'Intensity per unit produced',
  'Intensité par salarié': 'Intensity per employee',

  // Provenances de la donnée
  'Base de données': 'Database',
  'Ventilation comptable': 'Accounting allocation',
  'Saisie écran': 'Manual entry'
};

/**
 * Libellé de donnée dans la langue demandée.
 *
 * <p>En français, la valeur d'origine fait foi. En anglais, la correspondance
 * est cherchée, et le français subsiste à défaut : mieux vaut un terme non
 * traduit qu'une ligne vide dans un tableau d'inventaire.</p>
 */
export function traduireDonnee(libelle: string | null | undefined,
                               langue: LangueRapport): string {
  const valeur = String(libelle ?? '');
  if (langue === 'FR' || !valeur) return valeur;

  const direct = LIBELLES_DONNEES[valeur];
  if (direct) return direct;

  // Les intitulés composés — « Intensité par million de TND » — portent une
  // devise variable : la correspondance se fait alors sur le préfixe.
  if (valeur.startsWith('Intensité par million de ')) {
    return valeur.replace('Intensité par million de ', 'Intensity per million ');
  }

  return valeur;
}

/**
 * Libellé dans la langue demandée.
 *
 * <p>Une clé absente est rendue telle quelle plutôt que remplacée par un vide :
 * un libellé manquant doit se voir à l'écran, non disparaître du rapport.</p>
 */
export function traduire(clef: string, langue: LangueRapport): string {
  const entree = LIBELLES[clef];
  if (!entree) return clef;
  return langue === 'EN' ? entree.en : entree.fr;
}

/** Étiquette de langue du document, pour la page de garde. */
export function libelleLangue(langue: LangueRapport): string {
  return langue === 'EN' ? 'English' : 'Français';
}

/** Code de locale, pour les pipes `number` et `date`. */
export function localeDe(langue: LangueRapport): string {
  return langue === 'EN' ? 'en-GB' : 'fr-FR';
}
