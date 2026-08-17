package com.misfat.emissionservice.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Conversion de devises pour les facteurs monétaires.
 *
 * <p>Le projet n'expose aucun service de taux de change : les taux sont donc
 * pris en configuration ({@code emission.exchange-rates.*}), exprimés en unités
 * de devise par TND, et doivent être révisés périodiquement. Une conversion dont
 * le taux est inconnu est refusée plutôt que silencieusement approximée.</p>
 */
@Component
@Slf4j
public class CurrencyConverter {

    /** Devise pivot : tous les taux sont exprimés par rapport à elle. */
    public static final String DEVISE_PIVOT = "TND";

    private final Map<String, BigDecimal> tauxParDevise = new HashMap<>();

    public CurrencyConverter(
            @Value("${emission.exchange-rates.eur:0.29}") BigDecimal tauxEur,
            @Value("${emission.exchange-rates.mad:3.20}") BigDecimal tauxMad,
            @Value("${emission.exchange-rates.usd:0.32}") BigDecimal tauxUsd) {

        tauxParDevise.put(DEVISE_PIVOT, BigDecimal.ONE);
        tauxParDevise.put("EUR", tauxEur);
        tauxParDevise.put("MAD", tauxMad);
        tauxParDevise.put("USD", tauxUsd);
        log.info("Taux de change chargés (1 TND = ...) : {}", tauxParDevise);
    }

    public boolean estConnue(String devise) {
        return devise != null && tauxParDevise.containsKey(normaliser(devise));
    }

    /**
     * Convertit un montant d'une devise vers une autre en passant par le pivot.
     *
     * @throws IllegalArgumentException si l'une des deux devises est inconnue
     */
    public BigDecimal convertir(BigDecimal montant, String depuis, String vers) {
        if (montant == null) {
            return null;
        }
        String source = normaliser(depuis);
        String cible = normaliser(vers);

        if (source.equals(cible)) {
            return montant;
        }
        BigDecimal tauxSource = tauxParDevise.get(source);
        BigDecimal tauxCible = tauxParDevise.get(cible);

        if (tauxSource == null || tauxCible == null) {
            throw new IllegalArgumentException(
                    "Taux de change indisponible pour la conversion " + source + " vers " + cible);
        }

        // montant / tauxSource = valeur en TND, puis × tauxCible
        return montant.divide(tauxSource, 10, RoundingMode.HALF_UP)
                .multiply(tauxCible)
                .setScale(4, RoundingMode.HALF_UP);
    }

    private String normaliser(String devise) {
        return devise == null ? "" : devise.trim().toUpperCase(Locale.ROOT);
    }
}
