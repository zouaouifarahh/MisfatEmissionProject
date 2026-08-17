package com.misfat.dataimportservice.exception;

/** Violation d'unicité métier (ex. {@code codeName} déjà pris) : traduite en HTTP 409. */
public class DuplicateResourceException extends RuntimeException {

    public DuplicateResourceException(String message) {
        super(message);
    }
}
