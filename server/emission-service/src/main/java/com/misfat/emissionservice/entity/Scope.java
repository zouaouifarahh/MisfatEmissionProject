package com.misfat.emissionservice.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "ref_scopes")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class Scope {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String code; // SCOPE_1, SCOPE_2, SCOPE_3

    @Column(nullable = false)
    private String label; // Scope 1 · Direct, etc.
}