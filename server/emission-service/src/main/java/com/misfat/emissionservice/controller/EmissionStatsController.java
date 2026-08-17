package com.misfat.emissionservice.controller;

import com.misfat.emissionservice.dto.EmissionStatsDTO;
import com.misfat.emissionservice.service.EmissionStatsService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * Agrégats d'émissions pour le tableau de bord directeur.
 *
 * <p>Tout est calculé depuis {@code emission_measure} par un {@code GROUP BY}
 * exécuté en base : aucune valeur n'est codée en dur. La réponse porte les trois
 * axes attendus par le tableau de bord — scope, catégorie et filiale — dans les
 * deux modes de valorisation, physique (tCO₂e) et monétaire.</p>
 */
@RestController
@RequestMapping("/api/v1/emissions/stats")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class EmissionStatsController {

    private final EmissionStatsService statsService;

    /**
     * @param mode     {@code PHYSIQUE} (tCO₂e) ou {@code MONETAIRE} (devise)
     * @param entityId filiale ; absent = consolidé groupe
     * @param usineId  accepté pour compatibilité d'appel, mais sans effet :
     *                 {@code emission_measure} porte la filiale, pas l'usine
     * @param year     exercice ; absent = toutes années confondues
     * @param currency devise de restitution en mode monétaire, TND par défaut
     */
    @GetMapping("/aggregate")
    public EmissionStatsDTO aggregate(
            @RequestParam(name = "mode", defaultValue = "PHYSIQUE") String mode,
            @RequestParam(name = "entityId", required = false) Long entityId,
            @RequestParam(name = "usineId", required = false) Long usineId,
            @RequestParam(name = "year", required = false) Integer year,
            @RequestParam(name = "currency", required = false) String currency) {

        return statsService.agreger(mode, entityId, year, currency);
    }
}
