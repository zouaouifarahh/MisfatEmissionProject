package com.misfat.dataimportservice.service.parser;

import com.misfat.dataimportservice.dto.RawImportRowDto;
import com.misfat.dataimportservice.exception.ExcelParsingException;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class MatrixWasteExcelParserTest {

    private final MatrixWasteExcelParser parser = new MatrixWasteExcelParser();

    @Test
    void depile_la_matrice_en_lignes_plates_datees() throws Exception {
        try (Workbook classeur = new XSSFWorkbook()) {
            Sheet feuille = classeur.createSheet("Matrice");

            feuille.createRow(0).createCell(0).setCellValue("Matrice déchets 2025 - MISFAT 1");
            ecrire(feuille, 1, "Type de déchet", "Unité", "Janvier", "Février", "Mars");

            Row papier = feuille.createRow(2);
            papier.createCell(0).setCellValue("Papier / Carton");
            papier.createCell(1).setCellValue("kg");
            papier.createCell(2).setCellValue(1200);
            papier.createCell(3).setCellValue(950.5);
            // Mars vide : pas de collecte, ne doit rien produire

            Row huile = feuille.createRow(3);
            huile.createCell(0).setCellValue("Huiles usagées");
            huile.createCell(1).setCellValue("L");
            huile.createCell(2).setCellValue(300);
            huile.createCell(4).setCellValue(180);

            ExcelParseResult resultat = parser.parseDetailed(vers(classeur), 5L);

            assertEquals(4, resultat.totalDataRows(), "4 enregistrements = succes + erreurs");
            assertEquals(4, resultat.successCount(), "4 couples type/mois renseignés");
            assertEquals(0, resultat.errorCount(), "détail : " + resultat.errors());

            List<RawImportRowDto> lignes = resultat.rows();

            // Année tirée du titre, mois issu de la colonne
            assertEquals(LocalDate.of(2025, 1, 1), lignes.get(0).getDateDocument());
            assertEquals("Papier / Carton", lignes.get(0).getLabel());
            assertEquals(0, new BigDecimal("1200").compareTo(lignes.get(0).getRawAmount()));
            assertEquals("kg", lignes.get(0).getUnit());
            assertNull(lignes.get(0).getRawCurrency(), "une quantité n'a pas de devise");
            assertEquals(5L, lignes.get(0).getFilialeId());

            assertEquals(LocalDate.of(2025, 2, 1), lignes.get(1).getDateDocument());
            assertEquals(0, new BigDecimal("950.5").compareTo(lignes.get(1).getRawAmount()));

            assertEquals(LocalDate.of(2025, 1, 1), lignes.get(2).getDateDocument());
            assertEquals("Huiles usagées", lignes.get(2).getLabel());
            assertEquals("L", lignes.get(2).getUnit());

            assertEquals(LocalDate.of(2025, 3, 1), lignes.get(3).getDateDocument());
            assertEquals(0, new BigDecimal("180").compareTo(lignes.get(3).getRawAmount()));
        }
    }

    @Test
    void reconnait_les_mois_abreges_et_ignore_la_ligne_de_totaux() throws Exception {
        try (Workbook classeur = new XSSFWorkbook()) {
            Sheet feuille = classeur.createSheet();
            ecrire(feuille, 0, "Déchet", "Janv", "Févr", "Déc", "Total");

            Row ligne = feuille.createRow(1);
            ligne.createCell(0).setCellValue("DIB");
            ligne.createCell(1).setCellValue(10);
            ligne.createCell(2).setCellValue(20);
            ligne.createCell(3).setCellValue(30);
            ligne.createCell(4).setCellValue(60); // colonne Total : ignorée

            Row totaux = feuille.createRow(2);
            totaux.createCell(0).setCellValue("TOTAL");
            totaux.createCell(1).setCellValue(10);

            ExcelParseResult resultat = parser.parseDetailed(vers(classeur), 1L);

            assertEquals(3, resultat.totalDataRows(), "3 enregistrements, ligne TOTAL ecartee");
            assertEquals(3, resultat.successCount(), "3 mois, la colonne Total exclue");
            assertEquals(List.of(1, 2, 12),
                    resultat.rows().stream().map(r -> r.getDateDocument().getMonthValue()).toList());
        }
    }

    @Test
    void signale_les_valeurs_non_numeriques_et_negatives() throws Exception {
        try (Workbook classeur = new XSSFWorkbook()) {
            Sheet feuille = classeur.createSheet();
            ecrire(feuille, 0, "Type de déchet", "Janvier", "Février");

            Row ligne = feuille.createRow(1);
            ligne.createCell(0).setCellValue("Boues");
            ligne.createCell(1).setCellValue("n/a");
            ligne.createCell(2).setCellValue(-15);

            ExcelParseResult resultat = parser.parseDetailed(vers(classeur), 1L);

            assertEquals(2, resultat.totalDataRows(), "2 cellules candidates");
            assertEquals(0, resultat.successCount());
            assertEquals(2, resultat.errorCount(), "un rejet par cellule fautive");
            assertTrue(resultat.errors().stream().allMatch(e -> e.rowNumber() == 2));
            assertTrue(resultat.errors().stream().anyMatch(e -> e.message().contains("non numérique")));
            assertTrue(resultat.errors().stream().anyMatch(e -> e.message().contains("négative")));
        }
    }

    @Test
    void refuse_une_feuille_sans_colonne_de_mois() throws Exception {
        try (Workbook classeur = new XSSFWorkbook()) {
            Sheet feuille = classeur.createSheet();
            ecrire(feuille, 0, "Type de déchet", "Quantité", "Unité");
            Row ligne = feuille.createRow(1);
            ligne.createCell(0).setCellValue("DIB");
            ligne.createCell(1).setCellValue(100);

            InputStream flux = vers(classeur);
            ExcelParsingException erreur =
                    assertThrows(ExcelParsingException.class, () -> parser.parseDetailed(flux, 1L));
            assertTrue(erreur.getMessage().contains("mois"), erreur.getMessage());
        }
    }

    @Test
    void utilise_l_annee_courante_si_le_titre_n_en_porte_aucune() throws Exception {
        try (Workbook classeur = new XSSFWorkbook()) {
            Sheet feuille = classeur.createSheet();
            ecrire(feuille, 0, "Type de déchet", "Mai");
            Row ligne = feuille.createRow(1);
            ligne.createCell(0).setCellValue("Plastique");
            ligne.createCell(1).setCellValue(75);

            ExcelParseResult resultat = parser.parseDetailed(vers(classeur), 1L);

            assertEquals(1, resultat.successCount());
            assertEquals(LocalDate.now().getYear(), resultat.rows().get(0).getDateDocument().getYear());
            assertEquals(5, resultat.rows().get(0).getDateDocument().getMonthValue());
            assertEquals("kg", resultat.rows().get(0).getUnit(), "kg par défaut sans colonne Unité");
        }
    }

    // ---------- utilitaires ----------

    private void ecrire(Sheet feuille, int indexLigne, String... valeurs) {
        Row ligne = feuille.createRow(indexLigne);
        for (int i = 0; i < valeurs.length; i++) {
            ligne.createCell(i).setCellValue(valeurs[i]);
        }
    }

    private InputStream vers(Workbook classeur) throws Exception {
        ByteArrayOutputStream tampon = new ByteArrayOutputStream();
        classeur.write(tampon);
        return new ByteArrayInputStream(tampon.toByteArray());
    }
}
