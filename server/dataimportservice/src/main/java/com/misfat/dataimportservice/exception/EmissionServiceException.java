package com.misfat.dataimportservice.exception;

/**
 * Échec de l'appel à {@code emission-service} : service indisponible, erreur
 * serveur, ou refus d'exploiter les lignes transmises.
 *
 * <p>Exception métier distincte de {@link ExcelParsingException} : ici le
 * fichier a bien été lu, c'est la persistance en aval qui a échoué. Le log
 * d'import est clôturé en {@code FAILED} avant qu'elle ne soit levée.</p>
 */
public class EmissionServiceException extends RuntimeException {

    public EmissionServiceException(String message) {
        super(message);
    }

    public EmissionServiceException(String message, Throwable cause) {
        super(message, cause);
    }
}
