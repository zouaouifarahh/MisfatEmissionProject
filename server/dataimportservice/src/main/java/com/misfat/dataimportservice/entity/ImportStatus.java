package com.misfat.dataimportservice.entity;

/**
 * Cycle de vie d'un import : {@code IN_PROGRESS} à la création du log, puis état
 * final déduit du nombre de lignes en erreur à la clôture.
 */
public enum ImportStatus {
    IN_PROGRESS,
    SUCCESS,
    FAILED,
    PARTIAL_SUCCESS
}
