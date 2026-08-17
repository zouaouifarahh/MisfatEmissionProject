package com.misfat.dataimportservice.service.parser;

import com.misfat.dataimportservice.dto.RawImportRowDto;
import com.misfat.dataimportservice.entity.ExcelStructureType;
import com.misfat.dataimportservice.exception.ExcelParsingException;
import org.apache.poi.ss.usermodel.*;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

/**
 * Lecture ligne par ligne : Achats de biens et services, Investissements.
 *
 * <p>Les colonnes sont repérées par leur en-tête (insensible aux accents, à la
 * casse et à l'ordre) plutôt que par position fixe, les modèles de fichiers
 * variant d'une filiale à l'autre. À défaut d'en-tête reconnaissable, on
 * retombe sur l'ordre conventionnel Date / Libellé / Montant / Devise /
 * Catégorie.</p>
 */
@Component
public class LinearExcelParser implements ExcelParserStrategy {

    /** Nombre de lignes sondées au début du fichier pour trouver l'en-tête. */
    private static final int PROFONDEUR_RECHERCHE_ENTETE = 15;

    private static final Set<String> ENTETES_DATE =
            Set.of("date", "date document", "date facture", "date piece", "date ecriture", "periode");
    private static final Set<String> ENTETES_LIBELLE =
            Set.of("libelle", "designation", "description", "intitule", "objet", "nature");
    private static final Set<String> ENTETES_MONTANT =
            Set.of("montant", "montant ht", "montant ttc", "valeur", "cout", "prix", "total");
    private static final Set<String> ENTETES_DEVISE =
            Set.of("devise", "monnaie", "currency");
    private static final Set<String> ENTETES_CATEGORIE =
            Set.of("categorie", "categorie ghg", "famille", "rubrique", "compte", "code categorie");
    private static final Set<String> ENTETES_UNITE =
            Set.of("unite", "unit", "u");

    @Override
    public ExcelStructureType supportedStructure() {
        return ExcelStructureType.ROW_BY_ROW;
    }

    @Override
    public ExcelParseResult parseDetailed(InputStream inputStream, Long filialeId) {
        List<RawImportRowDto> lignes = new ArrayList<>();
        List<RowError> erreurs = new ArrayList<>();
        int lignesDonnees = 0;

        try (Workbook classeur = WorkbookFactory.create(inputStream)) {
            if (classeur.getNumberOfSheets() == 0) {
                throw new ExcelParsingException("Le classeur ne contient aucune feuille");
            }
            Sheet feuille = classeur.getSheetAt(0);
            CellValueReader lecteur = new CellValueReader(classeur);

            Mapping mapping = localiserColonnes(feuille, lecteur);

            for (int i = mapping.premiereLigneDonnees(); i <= feuille.getLastRowNum(); i++) {
                Row ligne = feuille.getRow(i);
                if (estLigneVide(ligne, lecteur)) {
                    continue;
                }
                lignesDonnees++;
                int numeroLigne = i + 1; // 1-based, comme affiché dans Excel

                try {
                    lignes.add(construireLigne(ligne, mapping, lecteur, filialeId, numeroLigne));
                } catch (LigneInvalideException e) {
                    erreurs.add(new RowError(numeroLigne, e.getMessage()));
                }
            }
        } catch (ExcelParsingException e) {
            throw e;
        } catch (Exception e) {
            throw new ExcelParsingException("Fichier Excel illisible : " + e.getMessage(), e);
        }

        return new ExcelParseResult(lignes, lignesDonnees, erreurs);
    }

    private RawImportRowDto construireLigne(Row ligne, Mapping mapping, CellValueReader lecteur,
                                            Long filialeId, int numeroLigne) {
        String libelle = lireTexte(ligne, mapping.libelle(), lecteur);
        if (libelle == null) {
            throw new LigneInvalideException("libellé absent");
        }

        BigDecimal montant = lireMontant(ligne, mapping.montant(), lecteur);
        if (montant == null) {
            throw new LigneInvalideException("montant absent ou non numérique");
        }

        LocalDate date = mapping.date() < 0 ? null : lecteur.readDate(ligne.getCell(mapping.date()));
        if (mapping.date() >= 0 && date == null) {
            throw new LigneInvalideException("date absente ou non interprétable");
        }

        String devise = lireTexte(ligne, mapping.devise(), lecteur);
        String unite = lireTexte(ligne, mapping.unite(), lecteur);

        return RawImportRowDto.builder()
                .dateDocument(date)
                .label(libelle)
                .rawAmount(montant)
                .rawCurrency(devise)
                .categoryCode(lireTexte(ligne, mapping.categorie(), lecteur))
                .sourceCode(null) // renseigné par le service, qui connaît le type de source
                .filialeId(filialeId)
                .unit(unite != null ? unite : devise)
                .sourceRowNumber(numeroLigne)
                .build();
    }

    /**
     * Recherche la ligne d'en-tête dans les premières lignes et associe chaque
     * rôle à son index de colonne.
     */
    private Mapping localiserColonnes(Sheet feuille, CellValueReader lecteur) {
        int derniereSondee = Math.min(feuille.getLastRowNum(), PROFONDEUR_RECHERCHE_ENTETE);

        for (int i = feuille.getFirstRowNum(); i <= derniereSondee; i++) {
            Row ligne = feuille.getRow(i);
            if (ligne == null) {
                continue;
            }

            int date = -1, libelle = -1, montant = -1, devise = -1, categorie = -1, unite = -1;

            for (int c = ligne.getFirstCellNum(); c < ligne.getLastCellNum(); c++) {
                String entete = CellValueReader.normalize(lecteur.readString(ligne.getCell(c)));
                if (entete.isEmpty()) {
                    continue;
                }
                if (date < 0 && ENTETES_DATE.contains(entete)) date = c;
                else if (libelle < 0 && ENTETES_LIBELLE.contains(entete)) libelle = c;
                else if (montant < 0 && ENTETES_MONTANT.contains(entete)) montant = c;
                else if (devise < 0 && ENTETES_DEVISE.contains(entete)) devise = c;
                else if (categorie < 0 && ENTETES_CATEGORIE.contains(entete)) categorie = c;
                else if (unite < 0 && ENTETES_UNITE.contains(entete)) unite = c;
            }

            // En-tête retenu dès que le couple libellé + montant est identifié.
            if (libelle >= 0 && montant >= 0) {
                return new Mapping(date, libelle, montant, devise, categorie, unite, i + 1);
            }
        }

        // Aucun en-tête exploitable : ordre conventionnel, données dès la 2e ligne.
        return new Mapping(0, 1, 2, 3, 4, -1, feuille.getFirstRowNum() + 1);
    }

    private boolean estLigneVide(Row ligne, CellValueReader lecteur) {
        if (ligne == null) {
            return true;
        }
        for (int c = ligne.getFirstCellNum(); c >= 0 && c < ligne.getLastCellNum(); c++) {
            if (!lecteur.isBlank(ligne.getCell(c))) {
                return false;
            }
        }
        return true;
    }

    private String lireTexte(Row ligne, int colonne, CellValueReader lecteur) {
        return colonne < 0 ? null : lecteur.readString(ligne.getCell(colonne));
    }

    private BigDecimal lireMontant(Row ligne, int colonne, CellValueReader lecteur) {
        return colonne < 0 ? null : lecteur.readDecimal(ligne.getCell(colonne));
    }

    /** Index de colonnes ({@code -1} = absente) et première ligne de données. */
    private record Mapping(int date, int libelle, int montant, int devise,
                           int categorie, int unite, int premiereLigneDonnees) {
    }

    /** Rejet d'une ligne, interne au parser. */
    private static class LigneInvalideException extends RuntimeException {
        LigneInvalideException(String message) {
            super(message);
        }
    }
}
