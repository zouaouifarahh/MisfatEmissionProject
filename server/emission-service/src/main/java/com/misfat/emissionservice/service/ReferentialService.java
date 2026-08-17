package com.misfat.emissionservice.service;

import com.misfat.emissionservice.dto.CategoryWithSourcesDTO;
import com.misfat.emissionservice.dto.CategoryWithSourcesDTO.SourceOptionDTO;
import com.misfat.emissionservice.entity.CarbonReference;
import com.misfat.emissionservice.entity.Category;
import com.misfat.emissionservice.entity.EmissionFactor;
import com.misfat.emissionservice.repository.CarbonReferenceRepository;
import com.misfat.emissionservice.repository.EmissionFactorRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/** Vues agrégées du référentiel carbone pour l'interface de saisie. */
@Service
@RequiredArgsConstructor
public class ReferentialService {

    private final CarbonReferenceRepository carbonReferenceRepository;
    private final EmissionFactorRepository emissionFactorRepository;

    /**
     * Catégories et sources associées, chaque source exposant son unité et son
     * facteur par défaut : le plus récent des facteurs rattachés à la référence.
     */
    @Transactional(readOnly = true)
    public List<CategoryWithSourcesDTO> categoriesAvecSources() {

        // Un seul chargement des facteurs, regroupés par référence : évite un
        // appel par source (N+1) sur les 68 références du référentiel.
        Map<Long, List<EmissionFactor>> facteursParReference = emissionFactorRepository.findAll().stream()
                .filter(f -> f.getCarbonReference() != null)
                .collect(Collectors.groupingBy(f -> f.getCarbonReference().getId()));

        Map<Long, List<CarbonReference>> referencesParCategorie = carbonReferenceRepository.findAll().stream()
                .filter(r -> r.getCategory() != null)
                .collect(Collectors.groupingBy(r -> r.getCategory().getId()));

        List<CategoryWithSourcesDTO> resultat = new ArrayList<>();

        for (Map.Entry<Long, List<CarbonReference>> entree : referencesParCategorie.entrySet()) {
            List<CarbonReference> references = entree.getValue();
            Category categorie = references.get(0).getCategory();

            List<SourceOptionDTO> sources = references.stream()
                    .sorted(Comparator.comparing(CarbonReference::getTypeName,
                            Comparator.nullsLast(String::compareToIgnoreCase)))
                    .map(reference -> versOption(reference, facteursParReference.get(reference.getId())))
                    .toList();

            resultat.add(new CategoryWithSourcesDTO(
                    categorie.getId(),
                    categorie.getName(),
                    categorie.getScope() != null ? categorie.getScope().getCode() : null,
                    categorie.getScope() != null ? categorie.getScope().getLabel() : null,
                    sources));
        }

        resultat.sort(Comparator
                .comparing(CategoryWithSourcesDTO::scopeCode, Comparator.nullsLast(String::compareTo))
                .thenComparing(CategoryWithSourcesDTO::categoryName, Comparator.nullsLast(String::compareToIgnoreCase)));
        return resultat;
    }

    private SourceOptionDTO versOption(CarbonReference reference, List<EmissionFactor> facteurs) {
        EmissionFactor defaut = (facteurs == null || facteurs.isEmpty()) ? null
                : facteurs.stream()
                .max(Comparator.comparing(EmissionFactor::getReferenceYear,
                        Comparator.nullsFirst(Integer::compareTo)))
                .orElse(null);

        return new SourceOptionDTO(
                reference.getId(),
                reference.getReferenceCode(),
                reference.getTypeName(),
                // L'unité vient du facteur retenu, à défaut de l'unité par défaut
                // de la référence : c'est elle qui est imposée à la saisie.
                defaut != null && defaut.getUnit() != null ? defaut.getUnit() : reference.getDefaultUnit(),
                defaut != null ? defaut.getId() : null,
                defaut != null ? defaut.getFactorValue() : null,
                defaut != null ? defaut.getDataType() : null,
                defaut != null ? defaut.getCurrency() : null,
                defaut != null ? defaut.getDatabaseSource() : null,
                defaut != null ? defaut.getReferenceYear() : null,
                defaut != null ? defaut.getUncertaintyPercent() : null,
                defaut != null ? defaut.getValidityLabel() : null);
    }
}
