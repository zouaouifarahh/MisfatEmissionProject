package com.misfat.emissionservice.service;

import com.misfat.emissionservice.repository.CarbonReferenceRepository;
import com.misfat.emissionservice.repository.CategoryRepository;
import com.misfat.emissionservice.repository.EmissionFactorRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddressList;
import org.apache.poi.xssf.usermodel.XSSFDataValidationHelper;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.ByteArrayOutputStream;
import java.util.*;
import java.util.stream.Stream;

/**
 * Construit le gabarit Excel du référentiel carbone, avec listes déroulantes.
 *
 * <p>Les valeurs autorisées sont lues en base plutôt que codées en dur : le
 * gabarit reflète donc toujours le référentiel réellement chargé. Une liste
 * vide retombe sur un jeu de valeurs par défaut, pour qu'un gabarit reste
 * utilisable même sur une base neuve.</p>
 */
@Service
@RequiredArgsConstructor
public class ReferentialTemplateBuilder {

    /**
     * Colonnes du gabarit unifié, couvrant toutes les bases d'activité.
     *
     * <p>Une base donnée n'en renseigne qu'une partie : un fichier d'achats
     * laisse la distance vide, un fichier de transport le descriptif. Le moteur
     * d'import résout les colonnes par leur intitulé et ignore les absentes, si
     * bien qu'un même gabarit sert toutes les collectes.</p>
     */
    public static final String[] COLONNES = {
            "CodeArticle", "Type", "Référence Carbone", "Catégorie", "Fact",
            "Valeur Fact", "Descriptif", "Valeur de Quantité", "Source",
            "Date Fact", "Unité", "Pays", "Distance Destination"
    };

    /**
     * Colonnes servant à identifier une ligne : CodeArticle, Type et Référence
     * Carbone. Mises en évidence dans l'en-tête, car une ligne qui n'en porte
     * aucune ne peut pas être rattachée au référentiel.
     */
    private static final Set<Integer> COLONNES_CLES = Set.of(0, 1, 2);

    private static final String[] EXEMPLE = {
            "ART-00124", "Diesel", "MS2ENDI", "Energy", "CO2e (KgCO2)",
            "3,294", "Gazole routier B7", "1250", "IPCC 2019",
            "Current", "L", "Tunisie", "320"
    };

    /** Index des colonnes portant une liste déroulante : Type, Catégorie, Unité, Pays. */
    private static final int COL_TYPE = 1;
    private static final int COL_CATEGORIE = 3;
    private static final int COL_UNITE = 10;
    private static final int COL_PAYS = 11;

    private static final List<String> PAYS_DEFAUT = List.of(
            "Tunisie", "Maroc", "France", "Algérie", "Allemagne", "Italie", "Espagne",
            "Portugal", "Belgique", "Pays-Bas", "Royaume-Uni", "Suisse", "Turquie",
            "États-Unis", "Chine", "Inde", "Japon", "Brésil");

    /** Onglet portant les listes ; masqué à l'ouverture. */
    private static final String FEUILLE_DATA = "Referentiel_Data";

    /** Nombre de lignes sur lesquelles la validation est posée. */
    private static final int LIGNES_VALIDEES = 500;

    private static final List<String> TYPES_DEFAUT = List.of(
            "Diesel", "Essence", "LPG", "Gaz Naturel", "Electricity", "R410a emissions",
            "Average diesel car", "Diesel medium and heavy duty truck");
    private static final List<String> CATEGORIES_DEFAUT = List.of(
            "Energy", "Company owned vehicles", "Company owned cars",
            "Refrigerant gas loss and other fugitive emissions",
            "Category 1: PG&S - GCP", "Category 2: Capital Goods",
            "Category 4: Upstream transportation and distribution",
            "Category 5: Waste Generated in Operations",
            "Category 6: Business Travel", "Category 7: Employee Commuting",
            "Category 9: Shipping");
    private static final List<String> UNITES_DEFAUT = List.of(
            "L", "Km", "KG", "KWh", "Tonne", "Tonne.Km", "pass.Km", "KGCO2eq/KG", "TND", "EUR", "US Dollar");

    private final CarbonReferenceRepository carbonReferenceRepository;
    private final CategoryRepository categoryRepository;
    private final EmissionFactorRepository emissionFactorRepository;

    public byte[] construire() throws Exception {
        List<String> types = valeurs(
                carbonReferenceRepository.findAll().stream().map(r -> r.getTypeName()).toList(), TYPES_DEFAUT);
        List<String> categories = valeurs(
                categoryRepository.findAll().stream().map(c -> c.getName()).toList(), CATEGORIES_DEFAUT);
        List<String> unites = valeurs(
                emissionFactorRepository.findAll().stream().map(f -> f.getUnit()).toList(), UNITES_DEFAUT);

        try (XSSFWorkbook classeur = new XSSFWorkbook();
             ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {

            XSSFSheet saisie = classeur.createSheet("Base carbone");
            XSSFSheet donnees = classeur.createSheet(FEUILLE_DATA);

            ecrireEntetes(classeur, saisie);
            ecrireExemple(saisie);
            remplirListes(donnees, types, categories, unites, PAYS_DEFAUT);

            appliquerValidation(saisie, COL_TYPE, FEUILLE_DATA + "!$A$2:$A$" + (types.size() + 1));
            appliquerValidation(saisie, COL_CATEGORIE, FEUILLE_DATA + "!$B$2:$B$" + (categories.size() + 1));
            appliquerValidation(saisie, COL_UNITE, FEUILLE_DATA + "!$C$2:$C$" + (unites.size() + 1));
            appliquerValidation(saisie, COL_PAYS, FEUILLE_DATA + "!$D$2:$D$" + (PAYS_DEFAUT.size() + 1));

            for (int i = 0; i < COLONNES.length; i++) {
                saisie.setColumnWidth(i, Math.max(16, COLONNES[i].length() + 8) * 256);
            }
            saisie.createFreezePane(0, 1);

            // Masqué : l'utilisateur ne saisit que dans « Base carbone ».
            classeur.setSheetHidden(classeur.getSheetIndex(donnees), true);
            classeur.setActiveSheet(classeur.getSheetIndex(saisie));

            classeur.write(sortie);
            return sortie.toByteArray();
        }
    }

    private void ecrireEntetes(XSSFWorkbook classeur, XSSFSheet feuille) {
        CellStyle standard = styleEntete(classeur, IndexedColors.DARK_BLUE);
        // Les colonnes clés ressortent en orange : elles ne peuvent pas être
        // toutes laissées vides, contrairement aux colonnes contextuelles.
        CellStyle cle = styleEntete(classeur, IndexedColors.ORANGE);

        Row entete = feuille.createRow(0);
        for (int i = 0; i < COLONNES.length; i++) {
            Cell cellule = entete.createCell(i);
            cellule.setCellValue(COLONNES[i]);
            cellule.setCellStyle(COLONNES_CLES.contains(i) ? cle : standard);
        }
    }

    private CellStyle styleEntete(XSSFWorkbook classeur, IndexedColors fond) {
        CellStyle style = classeur.createCellStyle();
        Font police = classeur.createFont();
        police.setBold(true);
        police.setColor(IndexedColors.WHITE.getIndex());
        style.setFont(police);
        style.setFillForegroundColor(fond.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        return style;
    }

    private void ecrireExemple(XSSFSheet feuille) {
        Row ligne = feuille.createRow(1);
        for (int i = 0; i < EXEMPLE.length; i++) {
            ligne.createCell(i).setCellValue(EXEMPLE[i]);
        }
    }

    private void remplirListes(XSSFSheet donnees, List<String> types, List<String> categories,
                               List<String> unites, List<String> pays) {
        Row entete = donnees.createRow(0);
        entete.createCell(0).setCellValue("Types");
        entete.createCell(1).setCellValue("Categories");
        entete.createCell(2).setCellValue("Unites");
        entete.createCell(3).setCellValue("Pays");

        int lignes = Stream.of(types, categories, unites, pays)
                .mapToInt(List::size)
                .max()
                .orElse(0);

        for (int i = 0; i < lignes; i++) {
            Row ligne = donnees.createRow(i + 1);
            if (i < types.size()) ligne.createCell(0).setCellValue(types.get(i));
            if (i < categories.size()) ligne.createCell(1).setCellValue(categories.get(i));
            if (i < unites.size()) ligne.createCell(2).setCellValue(unites.get(i));
            if (i < pays.size()) ligne.createCell(3).setCellValue(pays.get(i));
        }
    }

    /**
     * Pose une liste déroulante sur toute la colonne, de la ligne 2 à
     * {@link #LIGNES_VALIDEES}. La contrainte pointe l'onglet de données : une
     * liste explicite serait limitée à 255 caractères par Excel.
     */
    private void appliquerValidation(XSSFSheet feuille, int colonne, String plage) {
        DataValidationHelper aide = new XSSFDataValidationHelper(feuille);
        DataValidationConstraint contrainte = aide.createFormulaListConstraint(plage);
        CellRangeAddressList zone = new CellRangeAddressList(1, LIGNES_VALIDEES, colonne, colonne);

        DataValidation validation = aide.createValidation(contrainte, zone);
        validation.setShowErrorBox(true);
        validation.setSuppressDropDownArrow(true); // XSSF : true = flèche affichée
        validation.createErrorBox("Valeur non autorisée",
                "Choisissez une valeur dans la liste proposée.");
        feuille.addValidationData(validation);
    }

    /** Valeurs distinctes, triées, non vides ; repli sur le jeu par défaut. */
    private List<String> valeurs(List<String> brutes, List<String> defaut) {
        List<String> propres = brutes.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(v -> !v.isEmpty())
                .distinct()
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();
        return propres.isEmpty() ? defaut : propres;
    }
}
