package com.misfat.dataimportservice.entity;

/**
 * Forme du fichier Excel attendu pour un type de source.
 *
 * <ul>
 *   <li>{@code ROW_BY_ROW} : une ligne du fichier = une donnée d'activité.</li>
 *   <li>{@code MONTHLY_MATRIX} : matrice avec les mois en colonnes (ex. matrice déchets).</li>
 * </ul>
 */
public enum ExcelStructureType {
    ROW_BY_ROW,
    MONTHLY_MATRIX
}
