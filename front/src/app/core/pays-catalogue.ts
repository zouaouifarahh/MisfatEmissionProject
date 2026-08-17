/**
 * Liste des pays du monde, en français, avec leur indicatif ISO 3166-1 alpha-2.
 *
 * <p>Le code ISO sert à dériver le drapeau : les émojis de pavillon sont
 * composés de deux « indicateurs régionaux », obtenus par décalage des lettres
 * du code. Stocker un émoji par pays alourdirait la liste sans rien apporter.</p>
 */
export interface Pays {
  nom: string;
  code: string;
}

export const PAYS_DU_MONDE: Pays[] = [
  { nom: 'Afghanistan', code: 'AF' },
  { nom: 'Afrique du Sud', code: 'ZA' },
  { nom: 'Albanie', code: 'AL' },
  { nom: 'Algérie', code: 'DZ' },
  { nom: 'Allemagne', code: 'DE' },
  { nom: 'Andorre', code: 'AD' },
  { nom: 'Angola', code: 'AO' },
  { nom: 'Arabie saoudite', code: 'SA' },
  { nom: 'Argentine', code: 'AR' },
  { nom: 'Arménie', code: 'AM' },
  { nom: 'Australie', code: 'AU' },
  { nom: 'Autriche', code: 'AT' },
  { nom: 'Azerbaïdjan', code: 'AZ' },
  { nom: 'Bahreïn', code: 'BH' },
  { nom: 'Bangladesh', code: 'BD' },
  { nom: 'Belgique', code: 'BE' },
  { nom: 'Bénin', code: 'BJ' },
  { nom: 'Biélorussie', code: 'BY' },
  { nom: 'Bolivie', code: 'BO' },
  { nom: 'Bosnie-Herzégovine', code: 'BA' },
  { nom: 'Botswana', code: 'BW' },
  { nom: 'Brésil', code: 'BR' },
  { nom: 'Bulgarie', code: 'BG' },
  { nom: 'Burkina Faso', code: 'BF' },
  { nom: 'Burundi', code: 'BI' },
  { nom: 'Cambodge', code: 'KH' },
  { nom: 'Cameroun', code: 'CM' },
  { nom: 'Canada', code: 'CA' },
  { nom: 'Chili', code: 'CL' },
  { nom: 'Chine', code: 'CN' },
  { nom: 'Chypre', code: 'CY' },
  { nom: 'Colombie', code: 'CO' },
  { nom: 'Congo', code: 'CG' },
  { nom: 'Corée du Sud', code: 'KR' },
  { nom: "Côte d'Ivoire", code: 'CI' },
  { nom: 'Croatie', code: 'HR' },
  { nom: 'Cuba', code: 'CU' },
  { nom: 'Danemark', code: 'DK' },
  { nom: 'Égypte', code: 'EG' },
  { nom: 'Émirats arabes unis', code: 'AE' },
  { nom: 'Équateur', code: 'EC' },
  { nom: 'Espagne', code: 'ES' },
  { nom: 'Estonie', code: 'EE' },
  { nom: 'États-Unis', code: 'US' },
  { nom: 'Éthiopie', code: 'ET' },
  { nom: 'Finlande', code: 'FI' },
  { nom: 'France', code: 'FR' },
  { nom: 'Gabon', code: 'GA' },
  { nom: 'Géorgie', code: 'GE' },
  { nom: 'Ghana', code: 'GH' },
  { nom: 'Grèce', code: 'GR' },
  { nom: 'Guatemala', code: 'GT' },
  { nom: 'Guinée', code: 'GN' },
  { nom: 'Hongrie', code: 'HU' },
  { nom: 'Inde', code: 'IN' },
  { nom: 'Indonésie', code: 'ID' },
  { nom: 'Irak', code: 'IQ' },
  { nom: 'Iran', code: 'IR' },
  { nom: 'Irlande', code: 'IE' },
  { nom: 'Islande', code: 'IS' },
  { nom: 'Israël', code: 'IL' },
  { nom: 'Italie', code: 'IT' },
  { nom: 'Japon', code: 'JP' },
  { nom: 'Jordanie', code: 'JO' },
  { nom: 'Kazakhstan', code: 'KZ' },
  { nom: 'Kenya', code: 'KE' },
  { nom: 'Koweït', code: 'KW' },
  { nom: 'Laos', code: 'LA' },
  { nom: 'Lettonie', code: 'LV' },
  { nom: 'Liban', code: 'LB' },
  { nom: 'Libye', code: 'LY' },
  { nom: 'Lituanie', code: 'LT' },
  { nom: 'Luxembourg', code: 'LU' },
  { nom: 'Macédoine du Nord', code: 'MK' },
  { nom: 'Madagascar', code: 'MG' },
  { nom: 'Malaisie', code: 'MY' },
  { nom: 'Mali', code: 'ML' },
  { nom: 'Malte', code: 'MT' },
  { nom: 'Maroc', code: 'MA' },
  { nom: 'Maurice', code: 'MU' },
  { nom: 'Mauritanie', code: 'MR' },
  { nom: 'Mexique', code: 'MX' },
  { nom: 'Moldavie', code: 'MD' },
  { nom: 'Monaco', code: 'MC' },
  { nom: 'Mongolie', code: 'MN' },
  { nom: 'Monténégro', code: 'ME' },
  { nom: 'Mozambique', code: 'MZ' },
  { nom: 'Myanmar', code: 'MM' },
  { nom: 'Namibie', code: 'NA' },
  { nom: 'Népal', code: 'NP' },
  { nom: 'Niger', code: 'NE' },
  { nom: 'Nigeria', code: 'NG' },
  { nom: 'Norvège', code: 'NO' },
  { nom: 'Nouvelle-Zélande', code: 'NZ' },
  { nom: 'Oman', code: 'OM' },
  { nom: 'Ouganda', code: 'UG' },
  { nom: 'Ouzbékistan', code: 'UZ' },
  { nom: 'Pakistan', code: 'PK' },
  { nom: 'Panama', code: 'PA' },
  { nom: 'Paraguay', code: 'PY' },
  { nom: 'Pays-Bas', code: 'NL' },
  { nom: 'Pérou', code: 'PE' },
  { nom: 'Philippines', code: 'PH' },
  { nom: 'Pologne', code: 'PL' },
  { nom: 'Portugal', code: 'PT' },
  { nom: 'Qatar', code: 'QA' },
  { nom: 'République démocratique du Congo', code: 'CD' },
  { nom: 'République dominicaine', code: 'DO' },
  { nom: 'République tchèque', code: 'CZ' },
  { nom: 'Roumanie', code: 'RO' },
  { nom: 'Royaume-Uni', code: 'GB' },
  { nom: 'Russie', code: 'RU' },
  { nom: 'Rwanda', code: 'RW' },
  { nom: 'Sénégal', code: 'SN' },
  { nom: 'Serbie', code: 'RS' },
  { nom: 'Singapour', code: 'SG' },
  { nom: 'Slovaquie', code: 'SK' },
  { nom: 'Slovénie', code: 'SI' },
  { nom: 'Soudan', code: 'SD' },
  { nom: 'Sri Lanka', code: 'LK' },
  { nom: 'Suède', code: 'SE' },
  { nom: 'Suisse', code: 'CH' },
  { nom: 'Syrie', code: 'SY' },
  { nom: 'Tanzanie', code: 'TZ' },
  { nom: 'Tchad', code: 'TD' },
  { nom: 'Thaïlande', code: 'TH' },
  { nom: 'Togo', code: 'TG' },
  { nom: 'Tunisie', code: 'TN' },
  { nom: 'Turquie', code: 'TR' },
  { nom: 'Ukraine', code: 'UA' },
  { nom: 'Uruguay', code: 'UY' },
  { nom: 'Venezuela', code: 'VE' },
  { nom: 'Viêt Nam', code: 'VN' },
  { nom: 'Yémen', code: 'YE' },
  { nom: 'Zambie', code: 'ZM' },
  { nom: 'Zimbabwe', code: 'ZW' }
];

/** Forme comparable d'un libellé : casse, accents et espaces neutralisés. */
export function normaliserPays(valeur: string | null | undefined): string {
  return (valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Émoji drapeau d'un pays, dérivé de son code ISO.
 *
 * <p>Un pays hors liste renvoie le pavillon neutre plutôt qu'un drapeau
 * arbitraire.</p>
 */
export function drapeauEmoji(nomPays: string | null | undefined): string {
  const cible = normaliserPays(nomPays);
  const pays = PAYS_DU_MONDE.find(p => normaliserPays(p.nom) === cible);
  if (!pays) return '🏳️';

  // 0x1F1E6 est l'indicateur régional « A » ; le décalage depuis 'A' donne la lettre.
  const base = 0x1f1e6;
  const codePoints = [...pays.code].map(lettre => base + (lettre.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
}
