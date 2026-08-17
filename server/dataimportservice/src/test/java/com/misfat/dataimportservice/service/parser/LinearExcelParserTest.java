package com.misfat.dataimportservice.service.parser;

import com.misfat.dataimportservice.dto.RawImportRowDto;
import com.misfat.dataimportservice.exception.ExcelParsingException;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Date;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class LinearExcelParserTest {

    private final LinearExcelParser parser = new LinearExcelParser();

    @Test
    void lit_les_lignes_avec_entetes_dans_un_ordre_quelconque() throws Exception {
        try (Workbook classeur = new XSSFWorkbook()) {
            Sheet feuille = classeur.createSheet("Achats");
            CellStyle styleDate = styleDate(classeur);

            // En-têtes volontairement désordonnés et accentués
            ecrire(feuille, 0, "Libellé", "Montant", "Date", "Devise", "Catégorie");

            Row l1 = feuille.createRow(1);
            l1.createCell(0).setCellValue("Achat acier bobine");
            l1.createCell(1).setCellValue(15000.50);
            Cell dateCell = l1.createCell(2);
            dateCell.setCellValue(Date.from(LocalDate.of(2026, 3, 14)
                    .atStartOfDay(java.time.ZoneId.systemDefault()).toInstant()));
            dateCell.setCellStyle(styleDate);
            l1.createCell(3).setCellValue("TND");
            l1.createCell(4).setCellValue("CAT_1");

            ExcelParseResult resultat = parser.parseDetailed(vers(classeur), 7L);

            assertEquals(1, resultat.totalDataRows());
            assertEquals(1, resultat.successCount());
            assertEquals(0, resultat.errorCount());

            RawImportRowDto ligne = resultat.rows().get(0);
            assertEquals("Achat acier bobine", ligne.getLabel());
            assertEquals(0, new BigDecimal("15000.50").compareTo(ligne.getRawAmount()));
            assertEquals(LocalDate.of(2026, 3, 14), ligne.getDateDocument());
            assertEquals("TND", ligne.getRawCurrency());
            assertEquals("CAT_1", ligne.getCategoryCode());
            assertEquals(7L, ligne.getFilialeId());
            assertEquals(2, ligne.getSourceRowNumber());
        }
    }

    @Test
    void convertit_montants_texte_formule_et_date_texte() throws Exception {
        try (Workbook classeur = new XSSFWorkbook()) {
            Sheet feuille = classeur.createSheet();
            ecrire(feuille, 0, "Date", "Libellé", "Montant", "Devise");

            // Montant en texte, format français avec espace insécable et virgule
            Row l1 = feuille.createRow(1);
            l1.createCell(0).setCellValue("14/03/2026");
            l1.createCell(1).setCellValue("Fournitures");
            l1.createCell(2).setCellValue("1 234,56");
            l1.createCell(3).setCellValue("EUR");

            // Montant issu d'une formule
            Row l2 = feuille.createRow(2);
            l2.createCell(0).setCellValue("2026-04-01");
            l2.createCell(1).setCellValue("Transport");
            l2.createCell(2).setCellFormula("100*3");
            l2.createCell(3).setCellValue("EUR");

            // Montant négatif entre parenthèses (avoir)
            Row l3 = feuille.createRow(3);
            l3.createCell(0).setCellValue("05.04.2026");
            l3.createCell(1).setCellValue("Avoir fournisseur");
            l3.createCell(2).setCellValue("(250,00)");
            l3.createCell(3).setCellValue("EUR");

            ExcelParseResult resultat = parser.parseDetailed(vers(classeur), 1L);

            assertEquals(3, resultat.successCount(), "détail : " + resultat.errors());
            List<RawImportRowDto> lignes = resultat.rows();
            assertEquals(0, new BigDecimal("1234.56").compareTo(lignes.get(0).getRawAmount()));
            assertEquals(LocalDate.of(2026, 3, 14), lignes.get(0).getDateDocument());
            assertEquals(0, new BigDecimal("300").compareTo(lignes.get(1).getRawAmount()));
            assertEquals(LocalDate.of(2026, 4, 1), lignes.get(1).getDateDocument());
            assertEquals(0, new BigDecimal("-250").compareTo(lignes.get(2).getRawAmount()));
            assertEquals(LocalDate.of(2026, 4, 5), lignes.get(2).getDateDocument());
        }
    }

    @Test
    void rejette_les_lignes_invalides_sans_interrompre_la_lecture() throws Exception {
        try (Workbook classeur = new XSSFWorkbook()) {
            Sheet feuille = classeur.createSheet();
            ecrire(feuille, 0, "Date", "Libellé", "Montant");

            Row valide = feuille.createRow(1);
            valide.createCell(0).setCellValue("01/01/2026");
            valide.createCell(1).setCellValue("Ligne correcte");
            valide.createCell(2).setCellValue(10);

            Row sansMontant = feuille.createRow(2);
            sansMontant.createCell(0).setCellValue("02/01/2026");
            sansMontant.createCell(1).setCellValue("Montant manquant");

            Row montantIllisible = feuille.createRow(3);
            montantIllisible.createCell(0).setCellValue("03/01/2026");
            montantIllisible.createCell(1).setCellValue("Montant texte");
            montantIllisible.createCell(2).setCellValue("à confirmer");

            Row sansLibelle = feuille.createRow(4);
            sansLibelle.createCell(0).setCellValue("04/01/2026");
            sansLibelle.createCell(2).setCellValue(42);

            feuille.createRow(5); // ligne vide : ni succès ni erreur

            ExcelParseResult resultat = parser.parseDetailed(vers(classeur), 1L);

            assertEquals(4, resultat.totalDataRows());
            assertEquals(1, resultat.successCount());
            assertEquals(3, resultat.errorCount());
            assertTrue(resultat.errors().stream().anyMatch(e -> e.rowNumber() == 3));
            assertTrue(resultat.errors().stream().anyMatch(e -> e.message().contains("libellé")));
        }
    }

    @Test
    void retombe_sur_l_ordre_conventionnel_sans_entete() throws Exception {
        try (Workbook classeur = new XSSFWorkbook()) {
            Sheet feuille = classeur.createSheet();
            feuille.createRow(0).createCell(0).setCellValue("Export brut du 30/07/2026");

            Row l1 = feuille.createRow(1);
            l1.createCell(0).setCellValue("15/05/2026");
            l1.createCell(1).setCellValue("Sans en-tete");
            l1.createCell(2).setCellValue(500);
            l1.createCell(3).setCellValue("MAD");

            ExcelParseResult resultat = parser.parseDetailed(vers(classeur), 2L);

            assertEquals(1, resultat.successCount(), "détail : " + resultat.errors());
            assertEquals("Sans en-tete", resultat.rows().get(0).getLabel());
            assertEquals("MAD", resultat.rows().get(0).getRawCurrency());
        }
    }

    @Test
    void leve_une_exception_sur_un_fichier_non_excel() {
        InputStream faux = new ByteArrayInputStream("ceci n'est pas un classeur".getBytes());
        assertThrows(ExcelParsingException.class, () -> parser.parseDetailed(faux, 1L));
    }

    // ---------- utilitaires ----------

    private void ecrire(Sheet feuille, int indexLigne, String... valeurs) {
        Row ligne = feuille.createRow(indexLigne);
        for (int i = 0; i < valeurs.length; i++) {
            ligne.createCell(i).setCellValue(valeurs[i]);
        }
    }

    private CellStyle styleDate(Workbook classeur) {
        CellStyle style = classeur.createCellStyle();
        style.setDataFormat(classeur.getCreationHelper().createDataFormat().getFormat("dd/mm/yyyy"));
        return style;
    }

    private InputStream vers(Workbook classeur) throws Exception {
        ByteArrayOutputStream tampon = new ByteArrayOutputStream();
        classeur.write(tampon);
        return new ByteArrayInputStream(tampon.toByteArray());
    }
}
