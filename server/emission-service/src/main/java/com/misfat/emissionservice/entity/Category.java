package com.misfat.emissionservice.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "ref_categories")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class Category {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name; // ex: Refrigerant gas loss and other fugitive emissions

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "scope_id", nullable = false)
    private Scope scope;
}