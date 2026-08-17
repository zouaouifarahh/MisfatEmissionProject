package com.misfat.dataimportservice.service.impl;

import com.misfat.dataimportservice.dto.ImportSourceTypeDTO;
import com.misfat.dataimportservice.entity.ImportSourceType;
import com.misfat.dataimportservice.exception.DuplicateResourceException;
import com.misfat.dataimportservice.exception.ResourceNotFoundException;
import com.misfat.dataimportservice.repository.ImportSourceTypeRepository;
import com.misfat.dataimportservice.service.ImportSourceTypeService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class ImportSourceTypeServiceImpl implements ImportSourceTypeService {

    private final ImportSourceTypeRepository repository;

    @Override
    @Transactional(readOnly = true)
    public List<ImportSourceTypeDTO> findAll() {
        return repository.findAll().stream().map(this::toDTO).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ImportSourceTypeDTO> findAllActive() {
        return repository.findByActiveTrueOrderByDisplayNameAsc().stream().map(this::toDTO).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ImportSourceTypeDTO> findActiveByScope(String scopeTarget) {
        return repository.findByActiveTrueAndScopeTargetOrderByDisplayNameAsc(scopeTarget)
                .stream().map(this::toDTO).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public ImportSourceTypeDTO findById(Long id) {
        return toDTO(getOrThrow(id));
    }

    @Override
    @Transactional(readOnly = true)
    public ImportSourceTypeDTO findByCodeName(String codeName) {
        return repository.findByCodeName(codeName)
                .map(this::toDTO)
                .orElseThrow(() -> new ResourceNotFoundException("Type de source d'import", codeName));
    }

    @Override
    public ImportSourceTypeDTO create(ImportSourceTypeDTO dto) {
        if (repository.existsByCodeName(dto.getCodeName())) {
            throw new DuplicateResourceException("Le code technique est déjà utilisé : " + dto.getCodeName());
        }

        ImportSourceType entity = ImportSourceType.builder()
                .codeName(dto.getCodeName())
                .displayName(dto.getDisplayName())
                .scopeTarget(dto.getScopeTarget())
                .categoryTarget(dto.getCategoryTarget())
                .excelStructureType(dto.getExcelStructureType())
                .active(dto.getActive() == null ? Boolean.TRUE : dto.getActive())
                .build();

        return toDTO(repository.save(entity));
    }

    @Override
    public ImportSourceTypeDTO update(Long id, ImportSourceTypeDTO dto) {
        ImportSourceType entity = getOrThrow(id);

        if (repository.existsByCodeNameAndIdNot(dto.getCodeName(), id)) {
            throw new DuplicateResourceException("Le code technique est déjà utilisé : " + dto.getCodeName());
        }

        entity.setCodeName(dto.getCodeName());
        entity.setDisplayName(dto.getDisplayName());
        entity.setScopeTarget(dto.getScopeTarget());
        entity.setCategoryTarget(dto.getCategoryTarget());
        entity.setExcelStructureType(dto.getExcelStructureType());
        if (dto.getActive() != null) {
            entity.setActive(dto.getActive());
        }

        return toDTO(repository.save(entity));
    }

    @Override
    public ImportSourceTypeDTO deactivate(Long id) {
        ImportSourceType entity = getOrThrow(id);
        entity.setActive(Boolean.FALSE);
        return toDTO(repository.save(entity));
    }

    @Override
    public ImportSourceTypeDTO activate(Long id) {
        ImportSourceType entity = getOrThrow(id);
        entity.setActive(Boolean.TRUE);
        return toDTO(repository.save(entity));
    }

    private ImportSourceType getOrThrow(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Type de source d'import", id));
    }

    private ImportSourceTypeDTO toDTO(ImportSourceType entity) {
        return ImportSourceTypeDTO.builder()
                .id(entity.getId())
                .codeName(entity.getCodeName())
                .displayName(entity.getDisplayName())
                .scopeTarget(entity.getScopeTarget())
                .categoryTarget(entity.getCategoryTarget())
                .excelStructureType(entity.getExcelStructureType())
                .active(entity.getActive())
                .build();
    }
}
