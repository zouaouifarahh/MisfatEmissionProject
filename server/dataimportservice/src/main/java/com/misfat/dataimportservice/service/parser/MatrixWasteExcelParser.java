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
 * Dépilage (unpivot) de la matrice Déchets : types de déchets en lignes, mois en
 * colonnes.
 *
 * <p>Une cellule renseignée à l'intersection « Papier / Mars » produit une ligne
 * plate datée du 1er mars. Les cellules vides ou nulles ne génèrent rien : dans
 * ces matrices, l'absence de valeur signifie « pas de collecte », pas une
 * erreur de saisie.</p>
 */
@Component
public class MatrixWasteExcelParser implements ExcelParserStrategy {

    private static final int PROFONDEUR_RECHERCHE_ENTETE = 20;

    /** Libellés de mois acceptés, normalisés, index 1-based. */
    private static final Map<String, Integer> MOIS = construireMois();

    private static final Set<String> ENTETES_TYPE =
            Set.of("type de dechet", "type dechet", "dechet", "designation", "libelle",
                   "nature", "nature du dechet", "categorie de dechet");
    private static final Set<String> ENTETES_UNITE = Set.of("unite", "unit", "u");
    private static final Set<String> ENTETES_CODE =
            Set.of("code", "code dechet", "code categorie", "categorie ghg");
    private static final Set<String> ENTETES_A_IGNORER =
            Set.of("total", "totaux", "cumul", "annee", "moyenne", "commentaire", "observation");

    @Override
    public ExcelStructureType supportedStructure() {
        return ExcelStructureType.MONTHLY_MATRIX;
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

            Entete entete = localiserEntete(feuille, lecteur);
            if (entete.colonnesMois().isEmpty()) {
                throw new ExcelParsingException(
                        "Aucune colonne de mois reconnue : la feuille ne ressemble pas à une matrice mensuelle");
            }
            int annee = detecterAnnee(feuille, lecteur, entete.ligneEntete());

            for (int i = entete.ligneEntete() + 1; i <= feuille.getLastRowNum(); i++) {
                Row ligne = feuille.getRow(i);
                if (estLigneVide(ligne, lecteur)) {
                    continue;
                }
                int numeroLigne = i + 1;

                String type = lecteur.readString(ligne.getCell(entete.colonneType()));
                if (type == null) {
                    continue; // ligne de mise en forme sans libellé
                }
                if (ENTETES_A_IGNORER.contains(CellValueReader.normalize(type))) {
                    continue; // ligne de totaux
                }

                String unite = entete.colonneUnite() < 0
                        ? "kg"
                        : Optional.ofNullable(lecteur.readString(ligne.getCell(entete.colonneUnite()))).orElse("kg");
                String code = entete.colonneCode() < 0
                        ? null
                        : lecteur.readString(ligne.getCell(entete.colonneCode()));

                int produites = 0;
                int rejetees = 0;

                for (Map.Entry<Integer, Integer> colonneMois : entete.colonnesMois().entrySet()) {
                    Cell cellule = ligne.getCell(colonneMois.getKey());
                    if (lecteur.isBlank(cellule)) {
                        continue; // pas de collecte ce mois-là
                    }
                    BigDecimal quantite = lecteur.readDecimal(cellule);
                    if (quantite == null) {
                        erreurs.add(new RowError(numeroLigne,
                                "valeur non numérique en " + nomColonne(colonneMois.getKey())));
                        rejetees++;
                        continue;
                    }
                    if (quantite.signum() == 0) {
                        continue;
                    }
                    if (quantite.signum() < 0) {
                        erreurs.add(new RowError(numeroLigne,
                                "quantité négative en " + nomColonne(colonneMois.getKey())));
                        rejetees++;
                        continue;
                    }

                    lignes.add(RawImportRowDto.builder()
                            .dateDocument(LocalDate.of(annee, colonneMois.getValue(), 1))
                            .label(type)
                            .rawAmount(quantite)
                            .rawCurrency(null) // quantité physique, pas un montant
                            .categoryCode(code)
                            .sourceCode(null)
                            .filialeId(filialeId)
                            .unit(unite)
                            .sourceRowNumber(numeroLigne)
                            .build());
                    produites++;
                }

                if (produites == 0 && rejetees == 0) {
                    // Ligne de déchet déclarée mais aucun mois renseigné : elle compte
                    // pour un enregistrement attendu, en erreur.
                    erreurs.add(new RowError(numeroLigne, "aucune quantité renseignée sur les mois de la matrice"));
                    rejetees++;
                }
                lignesDonnees += produites + rejetees;
            }
        } catch (ExcelParsingException e) {
            throw e;
        } catch (Exception e) {
            throw new ExcelParsingException("Fichier Excel illisible : " + e.getMessage(), e);
        }

        return new ExcelParseResult(lignes, lignesDonnees, erreurs);
    }

    /**
     * Retient comme en-tête la ligne contenant le plus de colonnes de mois : les
     * matrices comportent souvent un titre et des lignes de mise en forme avant.
     */
    private Entete localiserEntete(Sheet feuille, CellValueReader lecteur) {
        int derniereSondee = Math.min(feuille.getLastRowNum(), PROFONDEUR_RECHERCHE_ENTETE);
        Entete meilleure = new Entete(feuille.getFirstRowNum(), 0, -1, -1, new LinkedHashMap<>());

        for (int i = feuille.getFirstRowNum(); i <= derniereSondee; i++) {
            Row ligne = feuille.getRow(i);
            if (ligne == null) {
                continue;
            }

            Map<Integer, Integer> colonnesMois = new LinkedHashMap<>();
            int colonneType = -1, colonneUnite = -1, colonneCode = -1;

            for (int c = ligne.getFirstCellNum(); c >= 0 && c < ligne.getLastCellNum(); c++) {
                Cell cellule = ligne.getCell(c);
                String brut = lecteur.readString(cellule);
                String entete = CellValueReader.normalize(brut);
                if (entete.isEmpty()) {
                    continue;
                }

                Integer mois = resoudreMois(entete, cellule, lecteur);
                if (mois != null) {
                    colonnesMois.put(c, mois);
                    continue;
                }
                if (colonneType < 0 && ENTETES_TYPE.contains(entete)) colonneType = c;
                else if (colonneUnite < 0 && ENTETES_UNITE.contains(entete)) colonneUnite = c;
                else if (colonneCode < 0 && ENTETES_CODE.contains(entete)) colonneCode = c;
            }

            if (colonnesMois.size() > meilleure.colonnesMois().size()) {
                // Sans en-tête de type identifié, la 1re colonne porte le libellé.
                meilleure = new Entete(i, colonneType < 0 ? 0 : colonneType,
                        colonneUnite, colonneCode, colonnesMois);
            }
        }
        return meilleure;
    }

    /** Reconnaît « Janvier », « janv », « 01 », ou une cellule datée. */
    private Integer resoudreMois(String enteteNormalise, Cell cellule, CellValueReader lecteur) {
        Integer parLibelle = MOIS.get(enteteNormalise);
        if (parLibelle != null) {
            return parLibelle;
        }
        if (enteteNormalise.matches("\\d{1,2}")) {
            int valeur = Integer.parseInt(enteteNormalise);
            return (valeur >= 1 && valeur <= 12) ? valeur : null;
        }
        LocalDate date = lecteur.readDate(cellule);
        return date == null ? null : date.getMonthValue();
    }

    /**
     * Année de référence : premier nombre à 4 chiffres plausible trouvé dans les
     * lignes précédant l'en-tête (titre du tableau), sinon l'année courante.
     */
    private int detecterAnnee(Sheet feuille, CellValueReader lecteur, int ligneEntete) {
        for (int i = feuille.getFirstRowNum(); i <= ligneEntete; i++) {
            Row ligne = feuille.getRow(i);
            if (ligne == null) {
                continue;
            }
            for (int c = ligne.getFirstCellNum(); c >= 0 && c < ligne.getLastCellNum(); c++) {
                String texte = lecteur.readString(ligne.getCell(c));
                if (texte == null) {
                    continue;
                }
                var motif = java.util.regex.Pattern.compile("(19|20)\\d{2}").matcher(texte);
                if (motif.find()) {
                    int annee = Integer.parseInt(motif.group());
                    if (annee >= 1990 && annee <= LocalDate.now().getYear() + 1) {
                        return annee;
                    }
                }
            }
        }
        return LocalDate.now().getYear();
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

    /** Référence de colonne façon Excel (A, B, ... AA) pour les messages d'erreur. */
    private String nomColonne(int index) {
        StringBuilder nom = new StringBuilder();
        int reste = index;
        while (reste >= 0) {
            nom.insert(0, (char) ('A' + reste % 26));
            reste = reste / 26 - 1;
        }
        return "colonne " + nom;
    }

    private static Map<String, Integer> construireMois() {
        Map<String, Integer> mois = new HashMap<>();
        String[][] libelles = {
                {"janvier", "janv", "jan", "january"},
                {"fevrier", "fevr", "fev", "february"},
                {"mars", "mar", "march"},
                {"avril", "avr", "april"},
                {"mai", "may"},
                {"juin", "jun", "june"},
                {"juillet", "juil", "jul", "july"},
                {"aout", "aou", "aug", "august"},
                {"septembre", "sept", "sep", "september"},
                {"octobre", "oct", "october"},
                {"novembre", "nov", "november"},
                {"decembre", "dec", "december"}
        };
        for (int i = 0; i < libelles.length; i++) {
            for (String libelle : libelles[i]) {
                mois.put(libelle, i + 1);
            }
        }
        return Map.copyOf(mois);
    }

    /** Ligne d'en-tête, colonnes descriptives et association colonne → mois. */
    private record Entete(int ligneEntete, int colonneType, int colonneUnite,
                          int colonneCode, Map<Integer, Integer> colonnesMois) {
    }
}
