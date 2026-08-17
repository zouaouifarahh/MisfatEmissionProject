package com.misfat.dataimportservice.service.parser;

import org.apache.poi.ss.usermodel.*;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Locale;

/**
 * Conversion des cellules POI en types Java, indépendamment du type de cellule
 * réellement utilisé dans le fichier.
 *
 * <p>Les fichiers fournis par les filiales mélangent les conventions : un même
 * montant peut arriver en {@code NUMERIC}, en {@code STRING} (« 1 234,50 ») ou
 * en {@code FORMULA}. Les formules sont évaluées quand c'est possible, sinon on
 * se rabat sur la dernière valeur mise en cache par Excel.</p>
 */
public final class CellValueReader {

    private final FormulaEvaluator evaluator;
    private final DataFormatter formatter = new DataFormatter(Locale.FRANCE);

    public CellValueReader(Workbook workbook) {
        FormulaEvaluator candidat = null;
        try {
            candidat = workbook.getCreationHelper().createFormulaEvaluator();
        } catch (Exception ignored) {
            // Classeur sans moteur de formules : on utilisera les valeurs en cache.
        }
        this.evaluator = candidat;
    }

    /** Type effectif de la cellule, formules résolues. */
    private CellType effectiveType(Cell cell) {
        if (cell == null) {
            return CellType.BLANK;
        }
        if (cell.getCellType() != CellType.FORMULA) {
            return cell.getCellType();
        }
        if (evaluator != null) {
            try {
                CellValue evaluee = evaluator.evaluate(cell);
                if (evaluee != null) {
                    return evaluee.getCellType();
                }
            } catch (Exception ignored) {
                // Fonction non supportée par POI : repli sur le cache Excel.
            }
        }
        return cell.getCachedFormulaResultType();
    }

    public boolean isBlank(Cell cell) {
        if (cell == null) {
            return true;
        }
        CellType type = effectiveType(cell);
        if (type == CellType.BLANK || type == CellType._NONE) {
            return true;
        }
        if (type == CellType.STRING) {
            String texte = readString(cell);
            return texte == null || texte.isBlank();
        }
        return false;
    }

    /** Texte de la cellule, {@code null} si vide. */
    public String readString(Cell cell) {
        if (cell == null) {
            return null;
        }
        CellType type = effectiveType(cell);

        String valeur = switch (type) {
            case STRING -> lireChaine(cell);
            case NUMERIC -> DateUtil.isCellDateFormatted(cell)
                    ? String.valueOf(readDate(cell))
                    : nettoyerNombre(lireNombre(cell));
            case BOOLEAN -> String.valueOf(lireBooleen(cell));
            default -> null;
        };

        if (valeur == null) {
            // Dernier recours : rendu formaté tel qu'affiché dans Excel.
            valeur = formatter.formatCellValue(cell, evaluator);
        }
        valeur = valeur == null ? null : valeur.trim();
        return (valeur == null || valeur.isEmpty()) ? null : valeur;
    }

    /** Montant ou quantité, {@code null} si la cellule ne contient pas de nombre. */
    public BigDecimal readDecimal(Cell cell) {
        if (cell == null) {
            return null;
        }
        CellType type = effectiveType(cell);

        if (type == CellType.NUMERIC) {
            return BigDecimal.valueOf(lireNombre(cell));
        }
        if (type == CellType.STRING) {
            return parseDecimal(lireChaine(cell));
        }
        return null;
    }

    /**
     * Tolère les conventions françaises : espaces (y compris insécables) comme
     * séparateur de milliers, virgule décimale, montant entre parenthèses pour
     * un négatif, symboles de devise collés.
     */
    public BigDecimal parseDecimal(String brut) {
        if (brut == null || brut.isBlank()) {
            return null;
        }
        String texte = brut.trim();
        boolean negatif = texte.startsWith("(") && texte.endsWith(")");
        if (negatif) {
            texte = texte.substring(1, texte.length() - 1);
        }

        texte = texte.replaceAll("[\\s\\u00A0\\u202F]", "")
                .replaceAll("[^0-9,.\\-]", "");

        if (texte.contains(",") && texte.contains(".")) {
            // Le séparateur décimal est le dernier des deux.
            texte = texte.lastIndexOf(',') > texte.lastIndexOf('.')
                    ? texte.replace(".", "").replace(',', '.')
                    : texte.replace(",", "");
        } else {
            texte = texte.replace(',', '.');
        }

        if (texte.isEmpty() || texte.equals("-") || texte.equals(".")) {
            return null;
        }
        try {
            BigDecimal valeur = new BigDecimal(texte);
            return negatif ? valeur.negate() : valeur;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** Date de la cellule, {@code null} si non interprétable. */
    public LocalDate readDate(Cell cell) {
        if (cell == null) {
            return null;
        }
        CellType type = effectiveType(cell);

        if (type == CellType.NUMERIC) {
            // Uniquement si la cellule est réellement formatée en date : un nombre
            // brut est indiscernable d'une quantité, l'interpréter en numéro de
            // série Excel transformerait « 100 » en 09/04/1900.
            if (DateUtil.isCellDateFormatted(cell)) {
                LocalDateTime horodatage = cell.getLocalDateTimeCellValue();
                return horodatage == null ? null : horodatage.toLocalDate();
            }
            return null;
        }
        if (type == CellType.STRING) {
            return DateTextParser.parse(lireChaine(cell));
        }
        return null;
    }

    /** Normalise un libellé pour comparaison : sans accent, minuscule, compacté. */
    public static String normalize(String texte) {
        if (texte == null) {
            return "";
        }
        String sansAccent = Normalizer.normalize(texte, Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "");
        return sansAccent.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", " ")
                .trim();
    }

    private String lireChaine(Cell cell) {
        if (cell.getCellType() == CellType.FORMULA) {
            if (evaluator != null) {
                try {
                    CellValue evaluee = evaluator.evaluate(cell);
                    if (evaluee != null && evaluee.getCellType() == CellType.STRING) {
                        return evaluee.getStringValue();
                    }
                } catch (Exception ignored) {
                    // repli ci-dessous
                }
            }
            RichTextString cache = cell.getRichStringCellValue();
            return cache == null ? null : cache.getString();
        }
        return cell.getStringCellValue();
    }

    private double lireNombre(Cell cell) {
        if (cell.getCellType() == CellType.FORMULA && evaluator != null) {
            try {
                CellValue evaluee = evaluator.evaluate(cell);
                if (evaluee != null && evaluee.getCellType() == CellType.NUMERIC) {
                    return evaluee.getNumberValue();
                }
            } catch (Exception ignored) {
                // repli ci-dessous
            }
        }
        return cell.getNumericCellValue();
    }

    private boolean lireBooleen(Cell cell) {
        if (cell.getCellType() == CellType.FORMULA && evaluator != null) {
            try {
                CellValue evaluee = evaluator.evaluate(cell);
                if (evaluee != null && evaluee.getCellType() == CellType.BOOLEAN) {
                    return evaluee.getBooleanValue();
                }
            } catch (Exception ignored) {
                // repli ci-dessous
            }
        }
        return cell.getBooleanCellValue();
    }

    /** Évite « 1234.0 » pour un entier stocké en NUMERIC. */
    private String nettoyerNombre(double valeur) {
        if (valeur == Math.floor(valeur) && !Double.isInfinite(valeur)) {
            return String.valueOf((long) valeur);
        }
        return BigDecimal.valueOf(valeur).stripTrailingZeros().toPlainString();
    }
}
