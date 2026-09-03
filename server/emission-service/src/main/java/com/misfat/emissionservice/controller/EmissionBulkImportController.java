package com.misfat.emissionservice.controller;

import com.misfat.emissionservice.dto.BulkImportResult;
import com.misfat.emissionservice.dto.CorrectedLineDto;
import com.misfat.emissionservice.dto.CorrectionResult;
import com.misfat.emissionservice.dto.RawImportRowDto;
import com.misfat.emissionservice.service.EmissionBulkImportService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Réception en masse des lignes d'activité extraites par
 * {@code data-import-service}.
 *
 * <p>Contrôleur distinct d'{@code EmissionMeasureController} : celui-ci est
 * mappé sur {@code /api/v1/emission-measures}, un chemin de méthode ne peut pas
 * s'en échapper, or la route demandée est {@code /api/v1/emissions/bulk-import}.</p>
 */
@RestController
@RequestMapping("/api/v1/emissions")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class EmissionBulkImportController {

    private final EmissionBulkImportService bulkImportService;

    /**
     * Le corps de réponse est vide pour respecter le contrat Feign
     * {@code ResponseEntity<Void>} ; la volumétrie est donc portée par des
     * en-têtes et le statut renseigne l'issue :
     *
     * <ul>
     *   <li>201 — toutes les lignes ont été enregistrées ;</li>
     *   <li>207 — enregistrement partiel, des lignes ont été écartées ;</li>
     *   <li>422 — aucune ligne exploitable.</li>
     * </ul>
     */
    @PostMapping("/bulk-import")
    public ResponseEntity<Void> bulkImportEmissions(
            @RequestBody List<RawImportRowDto> dtoList,
            // Facultatif : un import lancé depuis un écran de catégorie ne passe
            // pas par le journal du service d'import, et exiger son identifiant
            // lui fermerait cette route. La colonne ne porte aucune contrainte
            // référentielle — la laisser nulle ne casse rien, et dire d'où vient
            // le lot reste possible quand un journal existe.
            @RequestParam(value = "importLogId", required = false) Long importLogId) {

        BulkImportResult resultat = bulkImportService.bulkImport(dtoList, importLogId);

        HttpStatus statut;
        if (resultat.estVide()) {
            statut = HttpStatus.UNPROCESSABLE_CONTENT;
        } else if (resultat.estComplet()) {
            statut = HttpStatus.CREATED;
        } else {
            statut = HttpStatus.MULTI_STATUS;
        }

        return ResponseEntity.status(statut)
                .header("X-Imported-Count", String.valueOf(resultat.importedCount()))
                .header("X-Skipped-Count", String.valueOf(resultat.skippedCount()))
                .header("X-Skipped-Reasons", String.join(" | ", resultat.skippedReasons()))
                .build();
    }

    /**
     * Enregistre les lignes d'import corrigées puis validées à l'écran.
     *
     * <p>Le corps de réponse est ici pleinement exploité, contrairement à
     * {@link #bulkImportEmissions} : l'écran appelant doit savoir quelles clés
     * ont été retenues pour ne pas les représenter à la validation suivante.
     * Des en-têtes ne suffiraient pas à porter cette liste.</p>
     *
     * <p>Le statut reste 200 même en cas de rejet partiel : l'écran lit le
     * bilan et affiche lui-même ce qui n'a pas pu être enregistré. Un 4xx
     * ferait basculer l'appelant dans sa branche d'erreur alors que des lignes
     * ont bel et bien été persistées.</p>
     */
    @PostMapping("/corrections")
    public ResponseEntity<CorrectionResult> enregistrerCorrections(
            @RequestBody List<CorrectedLineDto> lignes) {

        return ResponseEntity.ok(bulkImportService.enregistrerCorrections(lignes));
    }
}
