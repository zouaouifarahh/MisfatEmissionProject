package com.misfat.emissionservice.service;

import com.misfat.emissionservice.dto.CarbonReferenceDTO;
import com.misfat.emissionservice.entity.CarbonReference;
import com.misfat.emissionservice.entity.Category;
import com.misfat.emissionservice.repository.CarbonReferenceRepository;
import com.misfat.emissionservice.repository.CategoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CarbonReferenceService {

    private final CarbonReferenceRepository carbonReferenceRepository;
    private final CategoryRepository categoryRepository;

    // --- 1. RÉCUPÉRER TOUTES LES RÉFÉRENCES (EN DTO) ---
    public List<CarbonReferenceDTO> getAllReferences() {
        return carbonReferenceRepository.findAll()
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    // --- 2. ENREGISTRER UNE RÉFÉRENCE ---
    public CarbonReferenceDTO saveReference(CarbonReferenceDTO dto) {
        CarbonReference entity = toEntity(dto);
        CarbonReference savedEntity = carbonReferenceRepository.save(entity);
        return toDto(savedEntity);
    }

    // --- 3. MÉTHODE DE MAPPING : Entity -> DTO ---
    public CarbonReferenceDTO toDto(CarbonReference entity) {
        if (entity == null) return null;

        return CarbonReferenceDTO.builder()
                .id(entity.getId())
                .referenceCode(entity.getReferenceCode())
                .typeName(entity.getTypeName())
                .defaultUnit(entity.getDefaultUnit())
                .categoryId(entity.getCategory() != null ? entity.getCategory().getId() : null)
                .categoryName(entity.getCategory() != null ? entity.getCategory().getName() : null)
                .scopeId(entity.getCategory() != null && entity.getCategory().getScope() != null
                        ? entity.getCategory().getScope().getId() : null)
                .scopeCode(entity.getCategory() != null && entity.getCategory().getScope() != null
                        ? entity.getCategory().getScope().getCode() : null)
                .scopeLabel(entity.getCategory() != null && entity.getCategory().getScope() != null
                        ? entity.getCategory().getScope().getLabel() : null)
                .build();
    }

    // --- 4. MÉTHODE INVERSE DE MAPPING : DTO -> Entity ---
    public CarbonReference toEntity(CarbonReferenceDTO dto) {
        if (dto == null) return null;

        CarbonReference entity = new CarbonReference();
        entity.setId(dto.getId());
        entity.setReferenceCode(dto.getReferenceCode());
        entity.setTypeName(dto.getTypeName());
        entity.setDefaultUnit(dto.getDefaultUnit());

        if (dto.getCategoryId() != null) {
            Category category = categoryRepository.findById(dto.getCategoryId())
                    .orElseThrow(() -> new RuntimeException("Catégorie introuvable id: " + dto.getCategoryId()));
            entity.setCategory(category);
        }

        return entity;
    }

    public List<CarbonReferenceDTO> getReferencesByScope(Long scopeId) {
        return carbonReferenceRepository.findByCategoryScopeId(scopeId)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public CarbonReferenceDTO getReferenceById(Long id) {
        CarbonReference entity = carbonReferenceRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Référence non trouvée avec l'id : " + id));
        return toDto(entity);
    }

    public void deleteReference(Long id) {
        carbonReferenceRepository.deleteById(id);
    }

    public List<String> getAllEmissionTypes() {
        return carbonReferenceRepository.findDistinctTypes();
    }
}