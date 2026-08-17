package com.misfat.dataimportservice;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.FileOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Génère sous {@code target/fixtures/} deux classeurs représentatifs, utilisables
 * pour tester l'endpoint d'upload à la main (curl, Postman).
 */
class ExcelFixtureGeneratorTest {

    private static final Path DOSSIER = Path.of("target", "fixtures");

    @Test
    void genere_les_fichiers_de_demonstration() throws Exception {
        Files.createDirectories(DOSSIER);
        genererAchats();
        genererMatriceDechets();
        genererAvecCodesReferentiel();
        assertTrue(Files.exists(DOSSIER.resolve("achats.xlsx")));
        assertTrue(Files.exists(DOSSIER.resolve("matrice-dechets.xlsx")));
        assertTrue(Files.exists(DOSSIER.resolve("consommations-referentiel.xlsx")));
    }

    /**
     * Fichier dont la colonne Catégorie porte de vrais codes du référentiel
     * carbone seedé : il permet de vérifier que le calcul résout le facteur par
     * appariement nominal, sans repli sur l'unité.
     */
    private void genererAvecCodesReferentiel() throws Exception {
        try (Workbook classeur = new XSSFWorkbook()) {
            Sheet feuille = classeur.createSheet("Consommations");
            CellStyle styleDate = classeur.createCellStyle();
            styleDate.setDataFormat(classeur.getCreationHelper().createDataFormat().getFormat("dd/mm/yyyy"));

            entete(feuille, "Date", "Libellé", "Montant", "Unité", "Catégorie");

            ajouterConso(feuille, 1, LocalDate.of(2026, 1, 15), "Gasoil camions de livraison", 1200, "L", "MS1COC", styleDate);
            ajouterConso(feuille, 2, LocalDate.of(2026, 2, 10), "Diesel groupe électrogène", 800, "L", "MS2ENDI", styleDate);
            ajouterConso(feuille, 3, LocalDate.of(2026, 3, 5), "Déplacements véhicules société", 4500, "Km", "MS1COV", styleDate);
            // Code inexistant : doit être écarté puisque le repli sur l'unité est supprimé
            ajouterConso(feuille, 4, LocalDate.of(2026, 3, 20), "Poste non référencé", 300, "L", "CODE_INCONNU", styleDate);

            try (FileOutputStream sortie = new FileOutputStream(
                    DOSSIER.resolve("consommations-referentiel.xlsx").toFile())) {
                classeur.write(sortie);
            }
        }
    }

    private void ajouterConso(Sheet feuille, int index, LocalDate date, String libelle,
                              double quantite, String unite, String categorie, CellStyle styleDate) {
        Row ligne = feuille.createRow(index);
        Cell dateCell = ligne.createCell(0);
        dateCell.setCellValue(Date.from(date.atStartOfDay(ZoneId.systemDefault()).toInstant()));
        dateCell.setCellStyle(styleDate);
        ligne.createCell(1).setCellValue(libelle);
        ligne.createCell(2).setCellValue(quantite);
        ligne.createCell(3).setCellValue(unite);
        ligne.createCell(4).setCellValue(categorie);
    }

    /** Structure ligne par ligne, avec une ligne volontairement invalide. */
    private void genererAchats() throws Exception {
        try (Workbook classeur = new XSSFWorkbook()) {
            Sheet feuille = classeur.createSheet("Achats 2026");
            CellStyle styleDate = classeur.createCellStyle();
            styleDate.setDataFormat(classeur.getCreationHelper().createDataFormat().getFormat("dd/mm/yyyy"));

            entete(feuille, "Date", "Libellé", "Montant", "Devise", "Catégorie");

            ajouterAchat(feuille, 1, LocalDate.of(2026, 1, 15), "Acier bobine 2mm", 45000.75, "TND", "CAT_1", styleDate);
            ajouterAchat(feuille, 2, LocalDate.of(2026, 2, 3), "Média filtrant cellulose", 128500.00, "TND", "CAT_1", styleDate);
            ajouterAchat(feuille, 3, LocalDate.of(2026, 2, 28), "Colle polyuréthane", 9750.40, "TND", "CAT_1", styleDate);

            // Ligne invalide : montant non numérique -> doit être rejetée
            Row invalide = feuille.createRow(4);
            Cell dateCell = invalide.createCell(0);
            dateCell.setCellValue(Date.from(LocalDate.of(2026, 3, 10).atStartOfDay(ZoneId.systemDefault()).toInstant()));
            dateCell.setCellStyle(styleDate);
            invalide.createCell(1).setCellValue("Prestation à chiffrer");
            invalide.createCell(2).setCellValue("devis en attente");
            invalide.createCell(3).setCellValue("TND");
            invalide.createCell(4).setCellValue("CAT_1");

            try (FileOutputStream sortie = new FileOutputStream(DOSSIER.resolve("achats.xlsx").toFile())) {
                classeur.write(sortie);
            }
        }
    }

    /** Matrice mensuelle : 3 types de déchets sur 4 mois. */
    private void genererMatriceDechets() throws Exception {
        try (Workbook classeur = new XSSFWorkbook()) {
            Sheet feuille = classeur.createSheet("Matrice");
            feuille.createRow(0).createCell(0).setCellValue("Matrice déchets 2026 — MISFAT 1");
            entete(feuille, 1, "Type de déchet", "Unité", "Janvier", "Février", "Mars", "Avril");

            ajouterDechet(feuille, 2, "Papier / Carton", "kg", 1200, 950.5, 0, 1100);
            ajouterDechet(feuille, 3, "Huiles usagées", "L", 300, 0, 180, 220);
            ajouterDechet(feuille, 4, "DIB", "kg", 4500, 4200, 4800, 5100);

            try (FileOutputStream sortie = new FileOutputStream(DOSSIER.resolve("matrice-dechets.xlsx").toFile())) {
                classeur.write(sortie);
            }
        }
    }

    private void entete(Sheet feuille, String... valeurs) {
        entete(feuille, 0, valeurs);
    }

    private void entete(Sheet feuille, int indexLigne, String... valeurs) {
        Row ligne = feuille.createRow(indexLigne);
        for (int i = 0; i < valeurs.length; i++) {
            ligne.createCell(i).setCellValue(valeurs[i]);
        }
    }

    private void ajouterAchat(Sheet feuille, int index, LocalDate date, String libelle,
                              double montant, String devise, String categorie, CellStyle styleDate) {
        Row ligne = feuille.createRow(index);
        Cell dateCell = ligne.createCell(0);
        dateCell.setCellValue(Date.from(date.atStartOfDay(ZoneId.systemDefault()).toInstant()));
        dateCell.setCellStyle(styleDate);
        ligne.createCell(1).setCellValue(libelle);
        ligne.createCell(2).setCellValue(montant);
        ligne.createCell(3).setCellValue(devise);
        ligne.createCell(4).setCellValue(categorie);
    }

    private void ajouterDechet(Sheet feuille, int index, String type, String unite, double... mois) {
        Row ligne = feuille.createRow(index);
        ligne.createCell(0).setCellValue(type);
        ligne.createCell(1).setCellValue(unite);
        for (int i = 0; i < mois.length; i++) {
            if (mois[i] > 0) {
                ligne.createCell(2 + i).setCellValue(mois[i]);
            }
        }
    }
}
