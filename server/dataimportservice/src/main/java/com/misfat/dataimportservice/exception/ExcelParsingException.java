package com.misfat.dataimportservice.exception;

/**
 * Fichier globalement illisible : format non reconnu, classeur corrompu, feuille
 * absente. Distinct d'une ligne invalide, qui est simplement écartée.
 */
public class ExcelParsingException extends RuntimeException {

    public ExcelParsingException(String message) {
        super(message);
    }

    public ExcelParsingException(String message, Throwable cause) {
        super(message, cause);
    }
}
