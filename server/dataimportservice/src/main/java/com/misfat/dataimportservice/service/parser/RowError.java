package com.misfat.dataimportservice.service.parser;

/** Rejet d'une ligne, rattaché à son numéro dans la feuille (1-based). */
public record RowError(int rowNumber, String message) {

    @Override
    public String toString() {
        return "ligne " + rowNumber + " : " + message;
    }
}
