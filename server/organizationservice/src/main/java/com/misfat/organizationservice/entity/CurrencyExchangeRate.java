package com.misfat.organizationservice.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Cours d'une devise face au dinar tunisien, pivot du référentiel.
 *
 * <p>{@code rate} se lit « 1 {@code currencyCode} = {@code rate} TND », dans le
 * sens du fichier source {@code devise_base_misfat_tunisie.xlsx} (colonne
 * {@code CoursApplique}). Le TND figure lui-même dans la table avec un cours de
 * 1, ce qui évite au consommateur de traiter le pivot à part.</p>
 */
@Entity
@Table(
        name = "currency_exchange_rate",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_currency_rate_devise_debut",
                columnNames = {"currency_code", "valid_from"})
)
public class CurrencyExchangeRate {

    /** Devise pivot du référentiel. */
    public static final String PIVOT = "TND";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "currency_code", nullable = false, length = 3)
    private String currencyCode;

    @Column(name = "rate", nullable = false, precision = 19, scale = 8)
    private BigDecimal rate;

    @Column(name = "valid_from", nullable = false)
    private LocalDate validFrom;

    @Column(name = "valid_to")
    private LocalDate validTo;

    /** Devise de contrepartie ; toujours TND en l'état du référentiel. */
    @Column(name = "pivot_currency", nullable = false, length = 3)
    private String pivotCurrency = PIVOT;

    public CurrencyExchangeRate() {
    }

    public CurrencyExchangeRate(String currencyCode, BigDecimal rate, LocalDate validFrom, LocalDate validTo) {
        this.currencyCode = currencyCode;
        this.rate = rate;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.pivotCurrency = PIVOT;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getCurrencyCode() { return currencyCode; }
    public void setCurrencyCode(String currencyCode) { this.currencyCode = currencyCode; }
    public BigDecimal getRate() { return rate; }
    public void setRate(BigDecimal rate) { this.rate = rate; }
    public LocalDate getValidFrom() { return validFrom; }
    public void setValidFrom(LocalDate validFrom) { this.validFrom = validFrom; }
    public LocalDate getValidTo() { return validTo; }
    public void setValidTo(LocalDate validTo) { this.validTo = validTo; }
    public String getPivotCurrency() { return pivotCurrency; }
    public void setPivotCurrency(String pivotCurrency) { this.pivotCurrency = pivotCurrency; }
}
