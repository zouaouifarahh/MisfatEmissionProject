package com.misfat.dataimportservice.service.parser;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Dates saisies en texte dans les fichiers des filiales. Les formats sont testés
 * dans l'ordre : le premier qui accepte la chaîne gagne.
 */
final class DateTextParser {

    private static final List<DateTimeFormatter> FORMATS = List.of(
            DateTimeFormatter.ofPattern("dd/MM/uuuu"),
            DateTimeFormatter.ofPattern("d/M/uuuu"),
            DateTimeFormatter.ofPattern("dd-MM-uuuu"),
            DateTimeFormatter.ofPattern("uuuu-MM-dd"),
            DateTimeFormatter.ofPattern("uuuu/MM/dd"),
            DateTimeFormatter.ofPattern("dd.MM.uuuu"),
            DateTimeFormatter.ofPattern("dd/MM/uu"),
            DateTimeFormatter.ofPattern("MM/uuuu"),
            DateTimeFormatter.ofPattern("uuuu-MM")
    );

    private DateTextParser() {
    }

    static LocalDate parse(String brut) {
        if (brut == null || brut.isBlank()) {
            return null;
        }
        String texte = brut.trim();

        for (DateTimeFormatter format : FORMATS) {
            try {
                return LocalDate.parse(texte, format);
            } catch (Exception ignored) {
                // format suivant
            }
        }

        // Formats « mois seul » : on rattache au premier jour du mois.
        for (DateTimeFormatter format : List.of(
                DateTimeFormatter.ofPattern("MM/uuuu"),
                DateTimeFormatter.ofPattern("uuuu-MM"))) {
            try {
                return LocalDate.parse(texte + "-01", format);
            } catch (Exception ignored) {
                // abandon
            }
        }
        return null;
    }
}
