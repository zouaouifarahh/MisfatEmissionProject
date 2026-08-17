package com.misfat.emissionservice.controller;

import com.misfat.emissionservice.entity.ReferentialImportLog;
import com.misfat.emissionservice.repository.ReferentialImportLogRepository;
import com.misfat.emissionservice.service.CarbonReferentialImporter;
import com.misfat.emissionservice.service.ReferentialTemplateBuilder;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Dépôt du classeur de référentiel carbone MISFAT.
 *
 * <p>Le fichier est lu puis répercuté dans {@code ref_carbon_references},
 * {@code ref_emission_sources} et {@code emission_factor}. Chaque dépôt est
 * journalisé, y compris en échec, pour alimenter l'historique de l'écran
 * d'import.</p>
 */
@RestController
@RequestMapping("/api/v1/referential")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
@Slf4j
public class ReferentialImportController {

    private final CarbonReferentialImporter importer;
    private final ReferentialImportLogRepository logRepository;
    private final ReferentialTemplateBuilder templateBuilder;

    @PostMapping(value = "/import", consumes = "multipart/form-data")
    public ResponseEntity<ReferentialImportLog> importer(
            @RequestPart("file") MultipartFile file,
            @RequestParam(name = "importedBy", required = false) String importedBy) {

        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        ReferentialImportLog journal = new ReferentialImportLog();
        journal.setFileName(file.getOriginalFilename());
        journal.setImportDate(LocalDateTime.now());
        journal.setImportedBy(importedBy);

        try (InputStream flux = file.getInputStream()) {
            CarbonReferentialImporter.Bilan bilan = importer.importer(flux);

            journal.setTotalRows(bilan.totalRows);
            journal.setCreatedReferences(bilan.references);
            journal.setCreatedSources(bilan.sources);
            journal.setCreatedFactors(bilan.facteurs);
            journal.setUpdatedFactors(bilan.facteursMisAJour);
            journal.setErrorCount(bilan.erreurCount());
            journal.setStatus(statut(bilan));
            journal.setErrorDetail(bilan.erreurs.isEmpty() ? null : tronquer(String.join(" | ", bilan.erreurs)));

            ReferentialImportLog enregistre = logRepository.save(journal);
            return ResponseEntity.status(HttpStatus.CREATED).body(enregistre);

        } catch (Exception e) {
            log.warn("Import du référentiel en échec : {}", e.getMessage());
            journal.setTotalRows(0);
            journal.setCreatedReferences(0);
            journal.setCreatedSources(0);
            journal.setCreatedFactors(0);
            journal.setUpdatedFactors(0);
            journal.setErrorCount(1);
            journal.setStatus("FAILED");
            journal.setErrorDetail(tronquer(e.getMessage()));
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_CONTENT).body(logRepository.save(journal));
        }
    }


    /**
     * Gabarit Excel officiel, avec listes déroulantes sur Type, Catégorie et
     * Unité. Généré côté serveur : les validations de données Excel ne peuvent
     * pas être écrites par la librairie du navigateur.
     */
    @GetMapping("/template")
    public ResponseEntity<Resource> gabarit() throws Exception {
        byte[] contenu = templateBuilder.construire();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"gabarit-base-carbone-misfat.xlsx\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .contentLength(contenu.length)
                .body(new ByteArrayResource(contenu));
    }

    /** Historique des dépôts, du plus récent au plus ancien. */
    @GetMapping("/imports")
    public List<ReferentialImportLog> historique() {
        return logRepository.findAllByOrderByImportDateDesc();
    }

    /**
     * Aucune ligne exploitée → échec ; des erreurs mais des créations → partiel ;
     * un fichier déjà chargé ne crée rien mais reste un succès.
     */
    private String statut(CarbonReferentialImporter.Bilan bilan) {
        if (bilan.totalRows == 0) return "FAILED";
        if (bilan.erreurCount() == 0) return "SUCCESS";
        return bilan.erreurCount() >= bilan.totalRows ? "FAILED" : "PARTIAL_SUCCESS";
    }

    private String tronquer(String texte) {
        if (texte == null) return null;
        return texte.length() <= 2000 ? texte : texte.substring(0, 1997) + "...";
    }
}
