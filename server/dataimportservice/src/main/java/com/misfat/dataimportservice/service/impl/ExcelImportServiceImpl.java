package com.misfat.dataimportservice.service.impl;

import com.misfat.dataimportservice.client.EmissionServiceClient;
import com.misfat.dataimportservice.dto.ImportLogDTO;
import com.misfat.dataimportservice.dto.ImportResultDTO;
import com.misfat.dataimportservice.dto.RawImportRowDto;
import com.misfat.dataimportservice.entity.ExcelStructureType;
import com.misfat.dataimportservice.entity.ImportLog;
import com.misfat.dataimportservice.entity.ImportSourceType;
import com.misfat.dataimportservice.entity.ImportStatus;
import com.misfat.dataimportservice.exception.EmissionServiceException;
import com.misfat.dataimportservice.exception.ExcelParsingException;
import com.misfat.dataimportservice.exception.ResourceNotFoundException;
import com.misfat.dataimportservice.repository.ImportLogRepository;
import com.misfat.dataimportservice.repository.ImportSourceTypeRepository;
import com.misfat.dataimportservice.service.ExcelImportService;
import com.misfat.dataimportservice.service.parser.ExcelParseResult;
import com.misfat.dataimportservice.service.parser.ExcelParserStrategy;
import com.misfat.dataimportservice.service.parser.RowError;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@Slf4j
public class ExcelImportServiceImpl implements ExcelImportService {

    /** Nombre de rejets détaillés conservés dans le log. */
    private static final int MAX_ERREURS_DETAILLEES = 20;
    private static final int LONGUEUR_MAX_DETAIL = 2000;

    private final ImportLogRepository logRepository;
    private final ImportSourceTypeRepository sourceTypeRepository;
    private final EmissionServiceClient emissionServiceClient;
    private final Map<ExcelStructureType, ExcelParserStrategy> parsers;

    public ExcelImportServiceImpl(ImportLogRepository logRepository,
                                  ImportSourceTypeRepository sourceTypeRepository,
                                  EmissionServiceClient emissionServiceClient,
                                  List<ExcelParserStrategy> strategies) {
        this.logRepository = logRepository;
        this.sourceTypeRepository = sourceTypeRepository;
        this.emissionServiceClient = emissionServiceClient;
        this.parsers = new EnumMap<>(ExcelStructureType.class);
        for (ExcelParserStrategy strategie : strategies) {
            this.parsers.put(strategie.supportedStructure(), strategie);
        }
        log.info("Parsers Excel enregistrés : {}", this.parsers.keySet());
    }

    /**
     * Volontairement <strong>hors transaction</strong> : chaque {@code save} doit
     * être validé isolément. Sous une transaction unique, la relance d'une
     * {@link ExcelParsingException} annulerait aussi l'écriture du log d'échec,
     * qui est précisément la trace que l'on veut conserver.
     */
    @Override
    public ImportResultDTO processFile(MultipartFile file, String sourceType, Long filialeId,
                                       Long usineId, String importedBy) {

        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Aucun fichier transmis");
        }

        ImportSourceType type = sourceTypeRepository.findByCodeName(sourceType)
                .orElseThrow(() -> new ResourceNotFoundException("Type de source d'import", sourceType));

        if (Boolean.FALSE.equals(type.getActive())) {
            throw new IllegalArgumentException("Le type de source " + sourceType + " est désactivé");
        }

        ExcelParserStrategy parser = parsers.get(type.getExcelStructureType());
        if (parser == null) {
            throw new IllegalStateException(
                    "Aucun parser disponible pour la structure " + type.getExcelStructureType());
        }

        // 1. Ouverture du log : la trace existe même si la lecture échoue ensuite.
        ImportLog journal = logRepository.save(ImportLog.builder()
                .fileName(file.getOriginalFilename())
                .importSourceTypeId(type.getId())
                .filialeId(filialeId)
                .usineId(usineId)
                .importDate(LocalDateTime.now())
                .totalLinesProcessed(0)
                .successCount(0)
                .errorCount(0)
                .status(ImportStatus.IN_PROGRESS)
                .importedBy(importedBy)
                .build());

        // 2. Lecture
        ExcelParseResult resultat;
        try (InputStream flux = file.getInputStream()) {
            resultat = parser.parseDetailed(flux, filialeId);
        } catch (ExcelParsingException e) {
            cloturerEnEchec(journal, e.getMessage());
            throw e;
        } catch (IOException e) {
            cloturerEnEchec(journal, "Lecture du flux impossible : " + e.getMessage());
            throw new ExcelParsingException("Lecture du flux impossible", e);
        }

        // 3. Le code de source n'est connu que d'ici : on complète les lignes.
        resultat.rows().forEach(ligne -> ligne.setSourceCode(type.getCodeName()));

        // 4. Transmission à emission-service pour calcul et persistance
        BilanAval aval = transmettreAEmissionService(resultat.rows(), journal);

        // 5. Clôture. Les compteurs décrivent l'import de bout en bout : un succès
        // est une ligne effectivement valorisée en aval, pas seulement lue. Sans
        // cela le log afficherait « 10 succès, 0 erreur » pour 3 mesures créées.
        journal.setTotalLinesProcessed(resultat.totalDataRows());
        journal.setSuccessCount(aval.transmis() ? aval.enregistrees() : 0);
        journal.setErrorCount(resultat.errorCount() + aval.ecartees());
        journal.setStatus(deduireStatut(resultat, aval));
        journal.setErrorDetail(formaterErreurs(resultat.errors(), aval));
        journal = logRepository.save(journal);

        log.info("Import {} ({}) : {} lignes, {} succès, {} erreurs -> {}",
                journal.getId(), type.getCodeName(), resultat.totalDataRows(),
                resultat.successCount(), resultat.errorCount(), journal.getStatus());

        return ImportResultDTO.builder()
                .log(toLogDTO(journal, type))
                .rows(resultat.rows())
                .errors(resultat.errors().stream().map(RowError::toString).toList())
                .build();
    }

    /**
     * Envoie les lignes lues à {@code emission-service}.
     *
     * <p>Un échec de communication ou une erreur serveur clôture le log en
     * {@code FAILED} avant de lever une {@link EmissionServiceException} : le
     * fichier a été lu, mais rien n'a été persisté en aval.</p>
     */
    private BilanAval transmettreAEmissionService(List<RawImportRowDto> lignes, ImportLog journal) {
        if (lignes.isEmpty()) {
            // Rien d'exploitable : inutile d'appeler l'aval.
            return new BilanAval(false, 0, 0, "aucune ligne exploitable à transmettre");
        }

        try {
            ResponseEntity<Void> reponse = emissionServiceClient.bulkImportEmissions(lignes, journal.getId());

            int enregistrees = enteteEntiere(reponse, "X-Imported-Count", lignes.size());
            int ecartees = enteteEntiere(reponse, "X-Skipped-Count", 0);
            String motifs = enteteTexte(reponse, "X-Skipped-Reasons");

            log.info("emission-service a répondu {} pour le log {} : {} enregistrées, {} écartées",
                    reponse.getStatusCode(), journal.getId(), enregistrees, ecartees);

            return new BilanAval(true, enregistrees, ecartees, motifs);

        } catch (Exception e) {
            // Feign traduit les 4xx/5xx en FeignException, et l'indisponibilité du
            // service en RetryableException : les deux sont fatales pour cet import.
            String motif = "emission-service injoignable ou en erreur : " + e.getMessage();
            cloturerEnEchec(journal, motif);
            throw new EmissionServiceException(motif, e);
        }
    }

    /**
     * Statut final : l'aval prime sur la lecture. Un fichier parfaitement lu dont
     * aucune ligne n'a pu être valorisée n'est pas un succès.
     */
    private ImportStatus deduireStatut(ExcelParseResult resultat, BilanAval aval) {
        if (resultat.totalDataRows() == 0 || !aval.transmis() || aval.enregistrees() == 0) {
            return ImportStatus.FAILED;
        }
        if (resultat.errorCount() == 0 && aval.ecartees() == 0) {
            return ImportStatus.SUCCESS;
        }
        return ImportStatus.PARTIAL_SUCCESS;
    }

    private int enteteEntiere(ResponseEntity<Void> reponse, String nom, int defaut) {
        String valeur = reponse.getHeaders().getFirst(nom);
        if (valeur == null || valeur.isBlank()) {
            return defaut;
        }
        try {
            return Integer.parseInt(valeur.trim());
        } catch (NumberFormatException e) {
            return defaut;
        }
    }

    private String enteteTexte(ResponseEntity<Void> reponse, String nom) {
        String valeur = reponse.getHeaders().getFirst(nom);
        return (valeur == null || valeur.isBlank()) ? null : valeur;
    }

    /** Issue de l'appel à emission-service. */
    private record BilanAval(boolean transmis, int enregistrees, int ecartees, String motifs) {
    }

    private void cloturerEnEchec(ImportLog journal, String motif) {
        journal.setStatus(ImportStatus.FAILED);
        journal.setErrorDetail(tronquer(motif));
        logRepository.save(journal);
        log.warn("Import {} en échec : {}", journal.getId(), motif);
    }

    /** Concatène les rejets de lecture et ceux remontés par l'aval. */
    private String formaterErreurs(List<RowError> erreurs, BilanAval aval) {
        StringBuilder detail = new StringBuilder();

        if (!erreurs.isEmpty()) {
            detail.append("Lecture — ").append(erreurs.stream()
                    .limit(MAX_ERREURS_DETAILLEES)
                    .map(RowError::toString)
                    .collect(Collectors.joining(" | ")));
            if (erreurs.size() > MAX_ERREURS_DETAILLEES) {
                detail.append(" | ... et ").append(erreurs.size() - MAX_ERREURS_DETAILLEES).append(" autre(s)");
            }
        }

        if (aval.ecartees() > 0 || (aval.motifs() != null && !aval.transmis())) {
            if (detail.length() > 0) {
                detail.append("  ||  ");
            }
            detail.append("Calcul — ").append(aval.ecartees()).append(" ligne(s) écartée(s)");
            if (aval.motifs() != null) {
                detail.append(" : ").append(aval.motifs());
            }
        }

        return detail.length() == 0 ? null : tronquer(detail.toString());
    }

    private String tronquer(String texte) {
        if (texte == null) {
            return null;
        }
        return texte.length() <= LONGUEUR_MAX_DETAIL
                ? texte
                : texte.substring(0, LONGUEUR_MAX_DETAIL - 3) + "...";
    }

    private ImportLogDTO toLogDTO(ImportLog journal, ImportSourceType type) {
        return ImportLogDTO.builder()
                .id(journal.getId())
                .fileName(journal.getFileName())
                .importSourceTypeId(journal.getImportSourceTypeId())
                .filialeId(journal.getFilialeId())
                .usineId(journal.getUsineId())
                .importDate(journal.getImportDate())
                .totalLinesProcessed(journal.getTotalLinesProcessed())
                .successCount(journal.getSuccessCount())
                .errorCount(journal.getErrorCount())
                .status(journal.getStatus())
                .importedBy(journal.getImportedBy())
                .importSourceTypeName(type.getDisplayName())
                .errorDetail(journal.getErrorDetail())
                .build();
    }
}
