package com.misfat.emissionservice.dto;

import java.util.List;

/**
 * Bilan de l'enregistrement des lignes corrigées.
 *
 * <p>Distinct de {@link BulkImportResult} par les {@code clesEnregistrees} : le
 * compte seul ne suffit pas à l'écran appelant. Il détient des lignes dans le
 * magasin du navigateur et doit savoir <em>lesquelles</em> sont désormais en
 * base, faute de quoi une seconde validation les enregistrerait une deuxième
 * fois.</p>
 *
 * @param clesEnregistrees clés des lignes effectivement persistées
 * @param ecartees         nombre de lignes qu'aucun facteur n'a pu rattacher
 * @param motifs           raison du rejet, ligne par ligne
 */
public record CorrectionResult(List<String> clesEnregistrees, int ecartees, List<String> motifs) {

    public int enregistrees() {
        return clesEnregistrees.size();
    }

    public boolean estComplet() {
        return ecartees == 0;
    }

    public boolean estVide() {
        return clesEnregistrees.isEmpty();
    }
}
