package com.misfat.emissionservice.service;

import com.misfat.emissionservice.dto.BulkImportResult;
import com.misfat.emissionservice.dto.RawImportRowDto;
import com.misfat.emissionservice.entity.EmissionFactor;
import com.misfat.emissionservice.entity.EmissionMeasure;
import com.misfat.emissionservice.entity.MeasureOrigin;
import com.misfat.emissionservice.repository.EmissionFactorRepository;
import com.misfat.emissionservice.repository.EmissionMeasureRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Transformation des lignes d'activité importées en mesures d'émission.
 *
 * <p>Chaque ligne est traitée indépendamment : une ligne sans facteur résoluble
 * est écartée avec son motif, les autres sont persistées. Un import où rien
 * n'est exploitable ne provoque pas d'exception, il renvoie un bilan vide — au
 * service appelant d'en tirer les conséquences.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EmissionBulkImportService {

    /** Nombre de motifs de rejet remontés à l'appelant. */
    private static final int MAX_MOTIFS = 50;

    private final EmissionMeasureRepository measureRepository;
    private final EmissionFactorRepository factorRepository;
    private final CurrencyConverter currencyConverter;

    @Transactional
    public BulkImportResult bulkImport(List<RawImportRowDto> lignes, Long importLogId) {
        if (lignes == null || lignes.isEmpty()) {
            return new BulkImportResult(0, 0, List.of());
        }

        List<EmissionMeasure> aPersister = new ArrayList<>();
        List<String> motifs = new ArrayList<>();

        for (RawImportRowDto ligne : lignes) {
            try {
                aPersister.add(construireMesure(ligne, importLogId));
            } catch (LigneNonExploitableException e) {
                if (motifs.size() < MAX_MOTIFS) {
                    motifs.add(reference(ligne) + " : " + e.getMessage());
                }
            }
        }

        // saveAll : un seul aller-retour, batch géré par Hibernate.
        if (!aPersister.isEmpty()) {
            measureRepository.saveAll(aPersister);
        }

        log.info("Import en masse (log {}) : {} mesures enregistrées, {} lignes écartées",
                importLogId, aPersister.size(), lignes.size() - aPersister.size());

        return new BulkImportResult(aPersister.size(), lignes.size() - aPersister.size(), motifs);
    }

    private EmissionMeasure construireMesure(RawImportRowDto ligne, Long importLogId) {
        if (ligne.getRawAmount() == null) {
            throw new LigneNonExploitableException("montant ou quantité absent");
        }
        if (ligne.getDateDocument() == null) {
            throw new LigneNonExploitableException("date du document absente");
        }

        boolean monetaire = ligne.getRawCurrency() != null && !ligne.getRawCurrency().isBlank();
        String dataType = monetaire ? "MONETAIRE" : "PHYSIQUE";

        EmissionFactor facteur = resoudreFacteur(ligne, dataType)
                .orElseThrow(() -> new LigneNonExploitableException(
                        "aucun facteur " + dataType + " pour categoryCode=" + ligne.getCategoryCode()
                                + " / sourceCode=" + ligne.getSourceCode()));

        // Quantité effectivement multipliée par le facteur : un montant est
        // ramené à la devise du facteur, une quantité physique reste telle quelle.
        BigDecimal quantite = ligne.getRawAmount();
        if (monetaire && facteur.getCurrency() != null && !facteur.getCurrency().isBlank()) {
            try {
                quantite = currencyConverter.convertir(quantite, ligne.getRawCurrency(), facteur.getCurrency());
            } catch (IllegalArgumentException e) {
                throw new LigneNonExploitableException(e.getMessage());
            }
        }

        EmissionMeasure mesure = new EmissionMeasure();
        mesure.setQuantity(quantite);
        mesure.setMeasureDate(ligne.getDateDocument());
        mesure.setEmissionFactor(facteur);
        mesure.setTotalCo2e(quantite.multiply(facteur.getFactorValue()).setScale(6, RoundingMode.HALF_UP));
        mesure.setOrigin(MeasureOrigin.EXCEL_IMPORT);
        mesure.setImportLogId(importLogId);
        mesure.setSourceCode(ligne.getSourceCode());
        mesure.setCategoryCode(ligne.getCategoryCode());
        mesure.setFilialeId(ligne.getFilialeId());
        mesure.setUnit(ligne.getUnit());
        mesure.setCurrency(ligne.getRawCurrency());
        mesure.setLabel(tronquer(ligne.getLabel(), 300));
        return mesure;
    }

    /**
     * Résolution du plus précis au plus large : code de référentiel, puis nom de
     * catégorie, puis libellé de type approchant. À égalité, le facteur dont
     * l'unité correspond à celle de la ligne est préféré.
     */
    private Optional<EmissionFactor> resoudreFacteur(RawImportRowDto ligne, String dataType) {
        for (String cle : new String[]{ligne.getCategoryCode(), ligne.getSourceCode()}) {
            if (cle == null || cle.isBlank()) {
                continue;
            }
            Optional<EmissionFactor> parCode = choisir(factorRepository.findByReferenceCode(cle, dataType), ligne);
            if (parCode.isPresent()) {
                return parCode;
            }
            Optional<EmissionFactor> parCategorie = choisir(factorRepository.findByCategoryNameExact(cle, dataType), ligne);
            if (parCategorie.isPresent()) {
                return parCategorie;
            }
        }

        // Rapprochement sur le libellé lu dans le fichier, dernier recours nominal.
        if (ligne.getLabel() != null && ligne.getLabel().length() >= 4) {
            return choisir(factorRepository.findByTypeNameContaining(ligne.getLabel(), dataType), ligne);
        }

        // Aucun repli sur la seule unité : apparier un déchet en kg au premier
        // facteur exprimé en kg produirait un calcul faux mais crédible. Mieux
        // vaut écarter la ligne et exiger un code référence exploitable.
        return Optional.empty();
    }

    private Optional<EmissionFactor> choisir(List<EmissionFactor> candidats, RawImportRowDto ligne) {
        if (candidats == null || candidats.isEmpty()) {
            return Optional.empty();
        }
        if (ligne.getUnit() != null) {
            Optional<EmissionFactor> memeUnite = candidats.stream()
                    .filter(f -> f.getUnit() != null && f.getUnit().equalsIgnoreCase(ligne.getUnit()))
                    .findFirst();
            if (memeUnite.isPresent()) {
                return memeUnite;
            }
        }
        // Les requêtes trient déjà par année de référence décroissante.
        return Optional.of(candidats.get(0));
    }

    private String reference(RawImportRowDto ligne) {
        return ligne.getSourceRowNumber() != null
                ? "ligne " + ligne.getSourceRowNumber()
                : "libellé « " + tronquer(ligne.getLabel(), 40) + " »";
    }

    private String tronquer(String texte, int longueur) {
        if (texte == null) {
            return null;
        }
        return texte.length() <= longueur ? texte : texte.substring(0, longueur);
    }

    /** Ligne inexploitable, interne au service. */
    private static class LigneNonExploitableException extends RuntimeException {
        LigneNonExploitableException(String message) {
            super(message);
        }
    }
}
