package com.misfat.emissionservice.service;

import com.misfat.emissionservice.dto.BulkImportResult;
import com.misfat.emissionservice.dto.CorrectedLineDto;
import com.misfat.emissionservice.dto.CorrectionResult;
import com.misfat.emissionservice.dto.RawImportRowDto;
import com.misfat.emissionservice.entity.EmissionFactor;
import com.misfat.emissionservice.entity.EmissionMeasure;
import com.misfat.emissionservice.entity.MeasureOrigin;
import com.misfat.emissionservice.repository.EmissionFactorRepository;
import com.misfat.emissionservice.repository.EmissionMeasureRepository;
import com.misfat.emissionservice.repository.UsineLookupRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
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

    /**
     * Plafond de plausibilité d'un facteur monétaire, en kgCO₂e par unité de devise.
     *
     * <p>Les bases entrées-sorties les plus intenses plafonnent autour de 2 à 5
     * kgCO₂e par unité monétaire dépensée ; les facteurs du référentiel MISFAT
     * se tiennent entre 0,1 et 0,6. Cent est donc vingt fois le pire cas connu :
     * ce seuil n'arbitre aucun cas discutable, il arrête une saisie impossible.</p>
     *
     * <p>Il existe parce que la correction manuelle donne à l'utilisateur le
     * dernier mot sur le facteur — c'est son objet — et qu'un champ libre finit
     * toujours par recevoir une valeur de test. Un facteur de 9 999 saisi sur
     * 1,5 million de dinars a produit 15 millions de tonnes sur un seul poste,
     * soit davantage que l'empreinte annuelle d'une ville moyenne.</p>
     */
    private static final BigDecimal FACTEUR_MONETAIRE_MAX = BigDecimal.valueOf(100);

    private final EmissionMeasureRepository measureRepository;
    private final EmissionFactorRepository factorRepository;
    private final CurrencyConverter currencyConverter;
    private final UsineLookupRepository usineLookupRepository;

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

    /**
     * Enregistre les lignes d'import corrigées puis validées à l'écran.
     *
     * <p>Deux différences avec {@link #bulkImport}, et elles tiennent toutes
     * deux au fait que l'utilisateur a tranché. D'abord le facteur : celui qu'il
     * a saisi prime sur celui du référentiel, sans quoi la validation
     * n'écrirait pas ce qu'il a corrigé mais ce que la machine avait déjà
     * proposé. Ensuite le rattachement : la ligne porte une usine, dont la
     * filiale se déduit, là où l'import automatique reçoit la filiale toute
     * faite.</p>
     *
     * <p>Le facteur d'émission reste résolu et rattaché : {@code
     * emission_factor_id} est NOT NULL, et une mesure qui ne pointerait sur
     * aucune référence serait invérifiable. Une ligne qu'aucun facteur ne
     * rattache est écartée avec son motif plutôt qu'enregistrée à moitié.</p>
     */
    @Transactional
    public CorrectionResult enregistrerCorrections(List<CorrectedLineDto> lignes) {
        if (lignes == null || lignes.isEmpty()) {
            return new CorrectionResult(List.of(), 0, List.of());
        }

        List<EmissionMeasure> aPersister = new ArrayList<>();
        List<String> clesRetenues = new ArrayList<>();
        List<String> motifs = new ArrayList<>();

        for (CorrectedLineDto ligne : lignes) {
            try {
                aPersister.add(construireMesureCorrigee(ligne));
                clesRetenues.add(ligne.getCle());
            } catch (LigneNonExploitableException e) {
                if (motifs.size() < MAX_MOTIFS) {
                    motifs.add(tronquer(ligne.getLabel(), 40) + " : " + e.getMessage());
                }
            }
        }

        if (!aPersister.isEmpty()) {
            measureRepository.saveAll(aPersister);
        }

        log.info("Corrections d'import : {} mesures enregistrées, {} lignes écartées",
                aPersister.size(), lignes.size() - aPersister.size());

        return new CorrectionResult(clesRetenues, lignes.size() - aPersister.size(), motifs);
    }

    private EmissionMeasure construireMesureCorrigee(CorrectedLineDto ligne) {
        if (ligne.getQuantity() == null) {
            throw new LigneNonExploitableException("montant ou quantité absent");
        }
        if (ligne.getFactor() == null || ligne.getFactor().signum() <= 0) {
            throw new LigneNonExploitableException("facteur corrigé absent ou non positif");
        }

        boolean monetaire = ligne.getRawCurrency() != null && !ligne.getRawCurrency().isBlank();
        String dataType = monetaire ? "MONETAIRE" : "PHYSIQUE";

        // La ligne est écartée plutôt que tronquée : ramener 9 999 à 100
        // enregistrerait un chiffre que personne n'a validé, et le rejet dit à
        // l'utilisateur ce qu'il doit corriger.
        if (monetaire && ligne.getFactor().compareTo(FACTEUR_MONETAIRE_MAX) > 0) {
            throw new LigneNonExploitableException(
                    "facteur monétaire implausible (" + ligne.getFactor().toPlainString()
                            + " kgCO2e/" + ligne.getRawCurrency() + ", maximum admis "
                            + FACTEUR_MONETAIRE_MAX.toPlainString() + ")");
        }

        // La résolution est celle de l'import automatique : elle part du code de
        // référentiel, puis de la catégorie corrigée, puis du libellé.
        RawImportRowDto pourResolution = RawImportRowDto.builder()
                .categoryCode(ligne.getCategoryCode())
                .sourceCode(ligne.getSourceCode())
                .label(ligne.getLabel())
                .unit(ligne.getUnit())
                .rawCurrency(ligne.getRawCurrency())
                .build();

        EmissionFactor facteur = resoudreFacteur(pourResolution, dataType)
                // Sans facteur du bon type, un facteur de la même devise suffit à
                // rattacher la mesure : la valeur appliquée est de toute façon
                // celle que l'utilisateur a corrigée, le rattachement ne sert
                // plus qu'à la traçabilité.
                .or(() -> premier(factorRepository.findByCurrencyOnly(
                        monetaire ? ligne.getRawCurrency() : "TND")))
                .orElseThrow(() -> new LigneNonExploitableException(
                        "aucun facteur d'émission à rattacher (categoryCode="
                                + ligne.getCategoryCode() + ")"));

        EmissionMeasure mesure = new EmissionMeasure();
        mesure.setQuantity(ligne.getQuantity());
        mesure.setMeasureDate(ligne.getMeasureDate() != null
                ? ligne.getMeasureDate() : LocalDate.now());
        mesure.setEmissionFactor(facteur);

        // Le total est recalculé ici, jamais repris du navigateur : une valeur
        // transmise telle quelle rendrait la base tributaire d'un arrondi
        // d'affichage, voire d'un total falsifié.
        mesure.setTotalCo2e(ligne.getQuantity()
                .multiply(ligne.getFactor())
                .setScale(6, RoundingMode.HALF_UP));

        mesure.setOrigin(MeasureOrigin.EXCEL_IMPORT);
        mesure.setImportLogId(ligne.getImportLogId());
        mesure.setSourceCode(tronquer(ligne.getSourceCode(), 60));
        mesure.setCategoryCode(tronquer(ligne.getCategoryCode(), 150));
        mesure.setUnit(tronquer(ligne.getUnit(), 20));
        mesure.setCurrency(tronquer(ligne.getRawCurrency(), 10));
        mesure.setLabel(tronquer(ligne.getLabel(), 300));

        mesure.setUsineId(ligne.getUsineId());
        if (ligne.getUsineId() != null) {
            usineLookupRepository.filialeDeLUsine(ligne.getUsineId())
                    .ifPresent(mesure::setFilialeId);
        }

        return mesure;
    }

    private Optional<EmissionFactor> premier(List<EmissionFactor> candidats) {
        return candidats == null || candidats.isEmpty()
                ? Optional.empty()
                : Optional.of(candidats.get(0));
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
