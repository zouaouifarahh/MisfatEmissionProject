package com.misfat.emissionservice.service;

import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;

import java.text.Normalizer;
import java.util.*;

/**
 * Résolution des colonnes d'un classeur d'import par leur intitulé.
 *
 * <p>Les bases d'activité MISFAT ne portent pas toutes les mêmes colonnes : un
 * fichier d'achats a un code article et un descriptif, un fichier de transport
 * une distance et un pays de destination, un référentiel de facteurs ni l'un ni
 * l'autre. Lire par position imposerait un gabarit unique et rigide, où toute
 * colonne absente décalerait toutes les suivantes.</p>
 *
 * <p>Les colonnes sont donc retrouvées par leur en-tête, à la casse, aux accents
 * et à la ponctuation près. Une colonne absente vaut {@link #ABSENTE} et
 * l'appelant l'ignore, au lieu de lire la valeur de sa voisine.</p>
 */
public final class ColonnesReferentiel {

    /** Renvoyé pour une colonne que le fichier ne porte pas. */
    public static final int ABSENTE = -1;

    /**
     * Intitulés reconnus, du plus récent au plus ancien.
     *
     * <p>Les gabarits antérieurs restent lisibles : « Référence Carbon » comme
     * « Référence Carbone » désignent la même colonne, et un fichier à neuf
     * colonnes s'importe sans conversion préalable.</p>
     */
    private static final Map<String, List<String>> ALIAS = Map.ofEntries(
            Map.entry("codeArticle", List.of("codearticle", "code article", "article", "code produit")),
            Map.entry("type", List.of("type", "typename", "libelle type")),
            Map.entry("reference", List.of("reference carbone", "reference carbon", "reference",
                    "referencecarbone", "code reference", "code ref")),
            Map.entry("categorie", List.of("categorie", "category", "categorie ghg")),
            Map.entry("fact", List.of("fact", "facteur", "intitule fact")),
            Map.entry("valeurFact", List.of("valeur fact", "valeurfact", "valeur facteur", "valeur")),
            Map.entry("descriptif", List.of("descriptif", "description", "libelle")),
            Map.entry("quantite", List.of("valeur de quantite", "valeur quantite", "quantite", "qte")),
            Map.entry("source", List.of("source", "base source", "database source")),
            Map.entry("dateFact", List.of("date fact", "datefact", "date", "validite")),
            Map.entry("unite", List.of("unite", "unit", "unite de mesure")),
            Map.entry("pays", List.of("pays", "country")),
            Map.entry("distance", List.of("distance destination", "distance", "distance km")),
            Map.entry("incertitude", List.of("incertitude", "uncertainty"))
    );

    private final Map<String, Integer> indices;

    private ColonnesReferentiel(Map<String, Integer> indices) {
        this.indices = indices;
    }

    /**
     * Analyse la ligne d'en-tête.
     *
     * @return la carte des colonnes reconnues ; celles absentes valent {@link #ABSENTE}
     */
    public static ColonnesReferentiel depuisEntete(Row entete, DataFormatter formatteur) {
        Map<String, Integer> trouvees = new HashMap<>();
        if (entete == null) {
            return new ColonnesReferentiel(trouvees);
        }

        for (int i = entete.getFirstCellNum(); i < entete.getLastCellNum(); i++) {
            String libelle = normaliser(formatteur.formatCellValue(entete.getCell(i)));
            if (libelle.isEmpty()) {
                continue;
            }
            for (Map.Entry<String, List<String>> entree : ALIAS.entrySet()) {
                // Première colonne gagnante : un doublon d'intitulé ne doit pas
                // écraser la colonne déjà retenue.
                if (!trouvees.containsKey(entree.getKey()) && entree.getValue().contains(libelle)) {
                    trouvees.put(entree.getKey(), i);
                    break;
                }
            }
        }
        return new ColonnesReferentiel(trouvees);
    }

    /** Disposition historique, à neuf colonnes fixes, sans ligne d'en-tête exploitable. */
    public static ColonnesReferentiel dispositionHistorique() {
        Map<String, Integer> indices = new HashMap<>();
        indices.put("type", 0);
        indices.put("reference", 1);
        indices.put("categorie", 2);
        indices.put("fact", 3);
        indices.put("valeurFact", 4);
        indices.put("incertitude", 5);
        indices.put("source", 6);
        indices.put("dateFact", 7);
        indices.put("unite", 8);
        return new ColonnesReferentiel(indices);
    }

    public int index(String nom) {
        return indices.getOrDefault(nom, ABSENTE);
    }

    public boolean porte(String nom) {
        return index(nom) != ABSENTE;
    }

    /**
     * Vrai si l'en-tête permet d'identifier une ligne.
     *
     * <p>Il faut au minimum de quoi désigner l'élément importé : la référence
     * carbone, à défaut le code article, à défaut le type.</p>
     */
    public boolean exploitable() {
        return porte("reference") || porte("codeArticle") || porte("type");
    }

    /** Casse, accents et ponctuation neutralisés pour comparer des intitulés. */
    private static String normaliser(String valeur) {
        if (valeur == null) {
            return "";
        }
        String sansAccent = Normalizer.normalize(valeur, Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "");
        return sansAccent
                .replaceAll("[^\\p{Alnum}]+", " ")
                .trim()
                .toLowerCase(Locale.ROOT);
    }
}
