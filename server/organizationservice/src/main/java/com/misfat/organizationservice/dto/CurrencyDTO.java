package com.misfat.organizationservice.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Devise disponible et son cours courant.
 *
 * @param rate      1 {@code code} = {@code rate} TND
 * @param pivot     vrai pour le TND lui-même
 */
public record CurrencyDTO(
        String code,
        String label,
        BigDecimal rate,
        LocalDate validFrom,
        LocalDate validTo,
        boolean pivot
) {
}
