package com.misfat.emissionservice.service;

import com.misfat.emissionservice.dto.CategoryWithSourcesDTO;
import com.misfat.emissionservice.dto.CategoryWithSourcesDTO.SourceOptionDTO;
import com.misfat.emissionservice.dto.CategoryWithSourcesDTO.VarianteFacteurDTO;
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

    /**
     * Ordre de présentation des facteurs d'une source.
     *
     * <p>Le plus récent d'abord : c'est celui que la saisie applique par défaut,
     * et celui qu'on cherche en premier dans une liste. À millésime égal, le
     * dernier créé prime — un ajout manuel se trouve alors en tête de liste
     * plutôt qu'enfoui derrière un facteur importé du même exercice.</p>
     */
    private static final Comparator<EmissionFactor> DU_PLUS_RECENT =
            Comparator.comparing(EmissionFactor::getReferenceYear,
                            Comparator.nullsFirst(Integer::compareTo))
                    .thenComparing(EmissionFactor::getId, Comparator.nullsFirst(Long::compareTo))
                    .reversed();

    private SourceOptionDTO versOption(CarbonReference reference, List<EmissionFactor> facteurs) {

        List<EmissionFactor> ordonnes = (facteurs == null ? List.<EmissionFactor>of() : facteurs)
                .stream()
                .sorted(DU_PLUS_RECENT)
                .toList();

        EmissionFactor defaut = ordonnes.isEmpty() ? null : ordonnes.get(0);

        List<VarianteFacteurDTO> variantes = ordonnes.stream()
                .map(facteur -> new VarianteFacteurDTO(
                        facteur.getId(),
                        facteur.getFactorValue(),
                        facteur.getUnit() != null ? facteur.getUnit() : reference.getDefaultUnit(),
                        facteur.getDataType(),
                        facteur.getCurrency(),
                        facteur.getDatabaseSource(),
                        facteur.getReferenceYear(),
                        facteur.getUncertaintyPercent(),
                        facteur.getValidityLabel()))
                .toList();

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
                defaut != null ? defaut.getValidityLabel() : null,
                variantes);
    }
}
