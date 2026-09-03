package com.misfat.emissionservice.service;

import com.misfat.emissionservice.entity.EmissionMeasure;
import com.misfat.emissionservice.entity.EmissionFactor;
import com.misfat.emissionservice.repository.EmissionMeasureRepository;
import com.misfat.emissionservice.repository.EmissionFactorRepository;
import com.misfat.emissionservice.repository.UsineLookupRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import com.misfat.emissionservice.dto.MesurePageDto;
import com.misfat.emissionservice.dto.PageMesuresDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

@Service
public class EmissionMeasureService {

    @Autowired
    private EmissionMeasureRepository measureRepository;

    @Autowired
    private EmissionFactorRepository factorRepository;

    @Autowired
    private UsineLookupRepository usineLookupRepository;

    /**
     * Page de mesures d'une catégorie, accompagnée des totaux du périmètre.
     *
     * <p>Les totaux ne se déduisent pas de la page : cinquante lignes sur cent
     * onze mille n'en disent rien. Ils sont comptés par la base, sur exactement
     * les mêmes critères — un en-tête et un tableau qui se contredisent coûtent
     * plus cher qu'une requête supplémentaire.</p>
     *
     * <p>Un critère nul vaut « tous », comme partout ailleurs : exercice non
     * renseigné pour la vue pluriannuelle, société non renseignée pour la vue
     * groupe.</p>
     */
    @Transactional(readOnly = true)
    public PageMesuresDto pagerParCategorie(String categorie, Integer annee, Long filialeId,
                                            int page, int taille) {

        Page<MesurePageDto> resultat = measureRepository.pagerParCategorie(
                categorie, annee, filialeId, PageRequest.of(Math.max(page, 0), taille));

        List<Object[]> totaux = measureRepository.totauxParCategorie(categorie, annee, filialeId);

        long nombre = 0L;
        BigDecimal co2e = BigDecimal.ZERO;
        BigDecimal quantite = BigDecimal.ZERO;

        if (!totaux.isEmpty() && totaux.get(0) != null) {
            Object[] ligne = totaux.get(0);
            nombre = ligne[0] == null ? 0L : ((Number) ligne[0]).longValue();
            co2e = ligne[1] == null ? BigDecimal.ZERO : (BigDecimal) ligne[1];
            quantite = ligne[2] == null ? BigDecimal.ZERO : (BigDecimal) ligne[2];
        }

        return new PageMesuresDto(
                resultat.getContent(), resultat.getNumber(), resultat.getSize(),
                nombre, resultat.getTotalPages(), co2e, quantite);
    }

    /**
     * Renseigne la filiale à partir de l'usine de la mesure.
     *
     * <p>L'usine est la source de vérité du rattachement ; la filiale n'en est
     * qu'une copie, tenue à jour ici pour que les agrégats restent lisibles
     * sans jointure. Une usine inconnue laisse la filiale en l'état plutôt que
     * de l'effacer : mieux vaut un rattachement ancien qu'aucun.</p>
     */
    private void rattacherALaFiliale(EmissionMeasure mesure) {
        if (mesure.getUsineId() == null) return;
        usineLookupRepository.filialeDeLUsine(mesure.getUsineId())
                .ifPresent(mesure::setFilialeId);
    }

    public List<EmissionMeasure> getAllMeasures() {
        return measureRepository.findAll();
    }

    public Optional<EmissionMeasure> getMeasureById(Long id) {
        return measureRepository.findById(id);
    }

    @Transactional
    public EmissionMeasure createMeasure(EmissionMeasure measure) {
        // 1. Récupérer le facteur d'émission complet lié à la saisie
        EmissionFactor factor = factorRepository.findById(measure.getEmissionFactor().getId())
                .orElseThrow(() -> new RuntimeException("Facteur d'émission introuvable avec l'ID : " + measure.getEmissionFactor().getId()));

        measure.setEmissionFactor(factor);

        // 2. Calcul automatique du CO2e global pour cette saisie utilisateur
        BigDecimal total = measure.getQuantity().multiply(factor.getFactorValue());
        measure.setTotalCo2e(total);

        // 3. Rattachement organisationnel, déduit de l'usine saisie.
        rattacherALaFiliale(measure);

        return measureRepository.save(measure);
    }

    @Transactional
    public Optional<EmissionMeasure> updateMeasure(Long id, EmissionMeasure updatedMeasure) {
        return measureRepository.findById(id).map(existingMeasure -> {
            // 1. Récupérer le facteur (au cas où l'utilisateur a changé de source/carburant)
            EmissionFactor factor = factorRepository.findById(updatedMeasure.getEmissionFactor().getId())
                    .orElseThrow(() -> new RuntimeException("Facteur d'émission introuvable."));

            // 2. Mettre à jour les données d'activité
            existingMeasure.setQuantity(updatedMeasure.getQuantity());
            existingMeasure.setMeasureDate(updatedMeasure.getMeasureDate());
            existingMeasure.setEmissionFactor(factor);

            // 3. Recalculer le total CO2e suite aux modifications
            BigDecimal total = updatedMeasure.getQuantity().multiply(factor.getFactorValue());
            existingMeasure.setTotalCo2e(total);

            // Un changement d'usine emporte celui de filiale.
            existingMeasure.setUsineId(updatedMeasure.getUsineId());
            rattacherALaFiliale(existingMeasure);

            return measureRepository.save(existingMeasure);
        });
    }

    @Transactional
    public boolean deleteMeasure(Long id) {
        return measureRepository.findById(id).map(measure -> {
            measureRepository.delete(measure);
            return true;
        }).orElse(false);
    }

    public List<EmissionMeasure> getMeasuresByCategory(String category) {
        return measureRepository.findByEmissionFactorCategoryContainingIgnoreCase(category);
    }
}