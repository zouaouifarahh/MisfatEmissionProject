package com.misfat.dataimportservice.service.impl;

import com.misfat.dataimportservice.dto.ImportLogDTO;
import com.misfat.dataimportservice.entity.ImportLog;
import com.misfat.dataimportservice.entity.ImportSourceType;
import com.misfat.dataimportservice.entity.ImportStatus;
import com.misfat.dataimportservice.exception.ResourceNotFoundException;
import com.misfat.dataimportservice.repository.ImportLogRepository;
import com.misfat.dataimportservice.repository.ImportSourceTypeRepository;
import com.misfat.dataimportservice.service.ImportLogService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class ImportLogServiceImpl implements ImportLogService {

    private final ImportLogRepository repository;
    private final ImportSourceTypeRepository sourceTypeRepository;

    @Override
    public ImportLogDTO startImport(ImportLogDTO dto) {
        // Le type de source doit exister : un log orphelin serait inexploitable.
        if (!sourceTypeRepository.existsById(dto.getImportSourceTypeId())) {
            throw new ResourceNotFoundException("Type de source d'import", dto.getImportSourceTypeId());
        }

        ImportLog entity = ImportLog.builder()
                .fileName(dto.getFileName())
                .importSourceTypeId(dto.getImportSourceTypeId())
                .filialeId(dto.getFilialeId())
                .usineId(dto.getUsineId())
                .importDate(dto.getImportDate() == null ? LocalDateTime.now() : dto.getImportDate())
                .totalLinesProcessed(0)
                .successCount(0)
                .errorCount(0)
                .status(ImportStatus.IN_PROGRESS)
                .importedBy(dto.getImportedBy())
                .build();

        return toDTO(repository.save(entity));
    }

    @Override
    public ImportLogDTO completeImport(Long id, Integer totalLinesProcessed, Integer successCount, Integer errorCount) {
        ImportLog entity = getOrThrow(id);

        int total = valeurOuZero(totalLinesProcessed);
        int succes = valeurOuZero(successCount);
        int erreurs = valeurOuZero(errorCount);

        if (succes + erreurs > total) {
            throw new IllegalArgumentException(
                    "Incohérence de volumétrie : succès (" + succes + ") + erreurs (" + erreurs
                            + ") dépassent le total traité (" + total + ")");
        }

        entity.setTotalLinesProcessed(total);
        entity.setSuccessCount(succes);
        entity.setErrorCount(erreurs);
        entity.setStatus(deduireStatut(succes, erreurs));

        return toDTO(repository.save(entity));
    }

    @Override
    public ImportLogDTO failImport(Long id) {
        ImportLog entity = getOrThrow(id);
        entity.setStatus(ImportStatus.FAILED);
        return toDTO(repository.save(entity));
    }

    @Override
    @Transactional(readOnly = true)
    public ImportLogDTO findById(Long id) {
        return toDTO(getOrThrow(id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<ImportLogDTO> findAll() {
        return repository.findAllByOrderByImportDateDesc().stream().map(this::toDTO).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ImportLogDTO> findByFiliale(Long filialeId) {
        return repository.findByFilialeIdOrderByImportDateDesc(filialeId).stream().map(this::toDTO).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ImportLogDTO> findByFilialeAndUsine(Long filialeId, Long usineId) {
        return repository.findByFilialeIdAndUsineIdOrderByImportDateDesc(filialeId, usineId)
                .stream().map(this::toDTO).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ImportLogDTO> findBySourceType(Long importSourceTypeId) {
        return repository.findByImportSourceTypeIdOrderByImportDateDesc(importSourceTypeId)
                .stream().map(this::toDTO).toList();
    }

    /** Aucune erreur → succès ; aucun succès → échec ; sinon partiel. */
    private ImportStatus deduireStatut(int succes, int erreurs) {
        if (erreurs == 0) {
            return ImportStatus.SUCCESS;
        }
        return succes == 0 ? ImportStatus.FAILED : ImportStatus.PARTIAL_SUCCESS;
    }

    private int valeurOuZero(Integer valeur) {
        return valeur == null ? 0 : valeur;
    }

    private ImportLog getOrThrow(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Log d'import", id));
    }

    private ImportLogDTO toDTO(ImportLog entity) {
        String libelleSource = sourceTypeRepository.findById(entity.getImportSourceTypeId())
                .map(ImportSourceType::getDisplayName)
                .orElse(null);

        return ImportLogDTO.builder()
                .id(entity.getId())
                .fileName(entity.getFileName())
                .importSourceTypeId(entity.getImportSourceTypeId())
                .filialeId(entity.getFilialeId())
                .usineId(entity.getUsineId())
                .importDate(entity.getImportDate())
                .totalLinesProcessed(entity.getTotalLinesProcessed())
                .successCount(entity.getSuccessCount())
                .errorCount(entity.getErrorCount())
                .status(entity.getStatus())
                .importedBy(entity.getImportedBy())
                .importSourceTypeName(libelleSource)
                .errorDetail(entity.getErrorDetail())
                .build();
    }
}
