package com.misfat.emissionservice.entity;

/** Provenance d'une mesure, pour la traçabilité des données extra-financières. */
public enum MeasureOrigin {

    /** Saisie manuelle dans le backoffice. */
    MANUAL_ENTRY,

    /** Issue d'un import de fichier Excel via data-import-service. */
    EXCEL_IMPORT
}
