package com.misfat.dataimportservice.exception;

/** Ressource absente : traduite en HTTP 404 par le gestionnaire global. */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }

    public ResourceNotFoundException(String ressource, Object identifiant) {
        super(ressource + " introuvable : " + identifiant);
    }
}
