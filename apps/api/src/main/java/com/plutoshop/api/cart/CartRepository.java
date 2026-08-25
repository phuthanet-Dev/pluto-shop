package com.plutoshop.api.cart;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CartRepository extends JpaRepository<Cart, Long> {

    @Query("select distinct c from Cart c left join fetch c.items where c.user.id = :userId and c.status = com.plutoshop.api.cart.CartStatus.ACTIVE")
    Optional<Cart> findActiveByUserId(@Param("userId") Long userId);
}
