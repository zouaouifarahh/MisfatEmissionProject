/**
 * Conversion des unités physiques de saisie.
 *
 * <p>Les factures ne parlent pas la langue du référentiel. Le gazole s'achète
 * en litres, le facteur s'exprime au kilogramme ; l'électricité se facture en
 * kWh, le référentiel documente le MWh ; le fret se compte en tonnes-kilomètres
 * quand le transporteur facture des kilomètres. Chacune de ces conversions est
 * triviale prise isolément, et chacune, oubliée, décale un poste d'un facteur
 * mille sans qu'aucun contrôle ne s'en aperçoive.</p>
 *
 * <p>Deux règles gouvernent ce module. Une conversion n'est possible qu'entre
 * unités de même dimension : convertir des litres en kilogrammes suppose une
 * masse volumique, qui dépend du produit et n'a rien à faire dans une table
 * générale. Et une unité inconnue ne se devine pas : elle rend {@code null},
 * pour que l'écran le signale au lieu de calculer à côté.</p>
 */

export type Dimension = 'MASSE' | 'VOLUME' | 'ENERGIE' | 'DISTANCE' | 'FRET';

export interface UniteConnue {
  /** Écriture canonique, telle que le référentiel l'emploie. */
  code: string;
  libelle: string;
  dimension: Dimension;
  /** Facteur vers l'unité de référence de la dimension. */
  versReference: number;
  /** Autres écritures rencontrées sur les factures et dans les classeurs. */
  alias: string[];
}

/** Unité de référence retenue pour chaque dimension. */
export const UNITE_REFERENCE: Record<Dimension, string> = {
  MASSE: 'kg',
  VOLUME: 'L',
  ENERGIE: 'kWh',
  DISTANCE: 'km',
  FRET: 't.km'
};

export const UNITES: UniteConnue[] = [
  // --- Masse : référence le kilogramme ---
  { code: 'kg', libelle: 'Kilogramme', dimension: 'MASSE', versReference: 1,
    alias: ['kilo', 'kilos', 'kilogramme', 'kilogrammes', 'kgs'] },
  { code: 't', libelle: 'Tonne', dimension: 'MASSE', versReference: 1_000,
    alias: ['tonne', 'tonnes', 'tn', 'to'] },
  { code: 'g', libelle: 'Gramme', dimension: 'MASSE', versReference: 0.001,
    alias: ['gramme', 'grammes'] },
  { code: 'kt', libelle: 'Kilotonne', dimension: 'MASSE', versReference: 1_000_000,
    alias: ['kilotonne', 'kilotonnes'] },

  // --- Volume : référence le litre ---
  { code: 'L', libelle: 'Litre', dimension: 'VOLUME', versReference: 1,
    alias: ['l', 'litre', 'litres', 'lt'] },
  { code: 'm3', libelle: 'Mètre cube', dimension: 'VOLUME', versReference: 1_000,
    alias: ['m³', 'metre cube', 'metres cubes', 'mc'] },
  { code: 'hL', libelle: 'Hectolitre', dimension: 'VOLUME', versReference: 100,
    alias: ['hl', 'hectolitre', 'hectolitres'] },
  { code: 'mL', libelle: 'Millilitre', dimension: 'VOLUME', versReference: 0.001,
    alias: ['ml', 'millilitre', 'millilitres'] },

  // --- Énergie : référence le kilowattheure ---
  { code: 'kWh', libelle: 'Kilowattheure', dimension: 'ENERGIE', versReference: 1,
    alias: ['kwh', 'kw h', 'kilowattheure', 'kilowattheures'] },
  { code: 'MWh', libelle: 'Mégawattheure', dimension: 'ENERGIE', versReference: 1_000,
    alias: ['mwh', 'megawattheure', 'megawattheures'] },
  { code: 'GWh', libelle: 'Gigawattheure', dimension: 'ENERGIE', versReference: 1_000_000,
    alias: ['gwh', 'gigawattheure'] },
  { code: 'GJ', libelle: 'Gigajoule', dimension: 'ENERGIE', versReference: 277.777_777_778,
    alias: ['gj', 'gigajoule', 'gigajoules'] },
  { code: 'MJ', libelle: 'Mégajoule', dimension: 'ENERGIE', versReference: 0.277_777_777_778,
    alias: ['mj', 'megajoule', 'megajoules'] },
  { code: 'therm', libelle: 'Therm', dimension: 'ENERGIE', versReference: 29.307_1,
    alias: ['therms'] },

  // --- Distance : référence le kilomètre ---
  { code: 'km', libelle: 'Kilomètre', dimension: 'DISTANCE', versReference: 1,
    alias: ['kilometre', 'kilometres', 'kms'] },
  { code: 'm', libelle: 'Mètre', dimension: 'DISTANCE', versReference: 0.001,
    alias: ['metre', 'metres'] },
  { code: 'mi', libelle: 'Mile', dimension: 'DISTANCE', versReference: 1.609_344,
    alias: ['mile', 'miles'] },
  { code: 'nmi', libelle: 'Mille marin', dimension: 'DISTANCE', versReference: 1.852,
    alias: ['mille marin', 'milles marins', 'nm'] },

  // --- Fret : référence la tonne-kilomètre ---
  { code: 't.km', libelle: 'Tonne-kilomètre', dimension: 'FRET', versReference: 1,
    alias: ['tkm', 't km', 'tonne km', 'tonne kilometre', 'tonnes kilometres'] },
  { code: 'kg.km', libelle: 'Kilogramme-kilomètre', dimension: 'FRET', versReference: 0.001,
    alias: ['kgkm', 'kg km'] }
];

/**
 * Forme comparable d'une unité : sans accents, sans ponctuation, en minuscules.
 *
 * <p>Les exposants sont ramenés à leur chiffre <strong>avant</strong> le
 * nettoyage de la ponctuation. Sans cela « m³ » perd son exposant et devient
 * « m » : le mètre cube s'emparait de la clé du mètre, et trois mètres cubes
 * d'eau se lisaient comme trois mètres.</p>
 */
export function normaliserUnite(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/[²]/g, '2')
    .replace(/[³]/g, '3')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Index des écritures connues vers leur unité, construit une fois. */
const INDEX_UNITES: Map<string, UniteConnue> = (() => {
  const index = new Map<string, UniteConnue>();
  for (const unite of UNITES) {
    for (const forme of [unite.code, unite.libelle, ...unite.alias]) {
      const clef = normaliserUnite(forme);
      if (clef && !index.has(clef)) index.set(clef, unite);
    }
  }
  return index;
})();

/** Unité correspondant à une écriture quelconque, ou `null` si inconnue. */
export function reconnaitreUnite(valeur: unknown): UniteConnue | null {
  return INDEX_UNITES.get(normaliserUnite(valeur)) ?? null;
}

export type StatutConversionUnite =
  | 'IDENTIQUE'
  | 'CONVERTI'
  /** Unités de dimensions différentes : la conversion demanderait une hypothèse. */
  | 'DIMENSIONS_INCOMPATIBLES'
  | 'UNITE_INCONNUE';

export interface ResultatConversionUnite {
  valeur: number;
  unite: string;
  statut: StatutConversionUnite;
  /** Rapport appliqué, `null` en l'absence de conversion. */
  rapport: number | null;
  avertissement: string;
}

/**
 * Convertit une quantité d'une unité vers une autre.
 *
 * <p>Le passage se fait par l'unité de référence de la dimension, ce qui évite
 * de tabuler tous les couples : une unité ajoutée ne demande qu'un facteur.</p>
 *
 * <p>Rien n'est converti entre dimensions. Des litres de gazole valent bien
 * des kilogrammes, mais par une masse volumique propre au produit : la poser
 * ici la rendrait invisible, et c'est le genre d'hypothèse qui doit figurer sur
 * la ligne de saisie.</p>
 */
export function convertirUnite(
  valeur: number,
  depuis: string | null | undefined,
  vers: string | null | undefined
): ResultatConversionUnite {

  const source = reconnaitreUnite(depuis);
  const cible = reconnaitreUnite(vers);

  if (!source || !cible) {
    const inconnue = !source ? depuis : vers;
    return {
      valeur, unite: String(depuis ?? ''), statut: 'UNITE_INCONNUE', rapport: null,
      avertissement: `L'unité « ${inconnue} » n'est pas au catalogue : la quantité `
        + `est conservée telle quelle plutôt que convertie au jugé.`
    };
  }

  if (source.code === cible.code) {
    return { valeur, unite: cible.code, statut: 'IDENTIQUE', rapport: 1, avertissement: '' };
  }

  if (source.dimension !== cible.dimension) {
    return {
      valeur, unite: source.code, statut: 'DIMENSIONS_INCOMPATIBLES', rapport: null,
      avertissement: `Convertir des ${source.libelle.toLowerCase()}s en `
        + `${cible.libelle.toLowerCase()}s demanderait une hypothèse propre au produit `
        + `(masse volumique, pouvoir calorifique). Elle doit être portée par la ligne, `
        + `non par la table des unités.`
    };
  }

  const rapport = source.versReference / cible.versReference;
  return { valeur: valeur * rapport, unite: cible.code, statut: 'CONVERTI',
           rapport, avertissement: '' };
}

/**
 * Aligne une quantité sur l'unité attendue par un facteur d'émission.
 *
 * <p>L'unité du facteur est souvent écrite « kgCO2e/L » ou « kgCO₂e par kWh » :
 * seule la partie après la barre décrit la quantité mesurée.</p>
 *
 * @returns la quantité alignée et le diagnostic ; la valeur d'origine est
 *   conservée quand l'alignement échoue.
 */
export function alignerSurFacteur(
  quantite: number,
  uniteSaisie: string | null | undefined,
  uniteFacteur: string | null | undefined
): ResultatConversionUnite {
  return convertirUnite(quantite, uniteSaisie, uniteDenominateur(uniteFacteur));
}

/** Partie « par unité » de l'unité d'un facteur : « kgCO2e/L » donne « L ». */
export function uniteDenominateur(uniteFacteur: string | null | undefined): string {
  const brut = String(uniteFacteur ?? '').trim();
  if (!brut) return '';

  const barre = brut.lastIndexOf('/');
  if (barre >= 0) return brut.slice(barre + 1).trim();

  const par = /\bpar\s+(.+)$/i.exec(brut);
  if (par) return par[1].trim();

  return brut;
}

/** Unités proposables pour une dimension, pour alimenter une liste déroulante. */
export function unitesDeDimension(dimension: Dimension): UniteConnue[] {
  return UNITES.filter(u => u.dimension === dimension);
}

/** Unités compatibles avec une unité donnée, elle comprise. */
export function unitesCompatibles(unite: string | null | undefined): UniteConnue[] {
  const reconnue = reconnaitreUnite(unite);
  return reconnue ? unitesDeDimension(reconnue.dimension) : [];
}
