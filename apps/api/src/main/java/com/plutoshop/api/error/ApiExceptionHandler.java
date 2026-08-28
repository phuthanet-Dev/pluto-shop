package com.plutoshop.api.error;

import java.net.URI;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import com.plutoshop.api.admin.AdminProductConflictException;
import com.plutoshop.api.admin.AdminProductNotFoundException;
import com.plutoshop.api.payment.PaymentConfigurationException;
import com.plutoshop.api.payment.PaymentConflictException;
import com.plutoshop.api.payment.PaymentGatewayException;
import com.plutoshop.api.payment.PaymentNotFoundException;
import com.plutoshop.api.payment.PromptPayUnavailableException;

@RestControllerAdvice
class ApiExceptionHandler {

    private static final URI ABOUT_BLANK = URI.create("about:blank");
    private static final String INVALID_PARAMETERS_TITLE = "Invalid request parameters";

    @ExceptionHandler(InvalidRequestParameterException.class)
    ResponseEntity<SanitizedProblemDetail> handleInvalidRequestParameter(
            InvalidRequestParameterException exception) {
        return problem(HttpStatus.BAD_REQUEST, INVALID_PARAMETERS_TITLE, exception.getMessage());
    }

    @ExceptionHandler({
            MethodArgumentNotValidException.class,
            HttpMessageNotReadableException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class
    })
    ResponseEntity<SanitizedProblemDetail> handleMalformedRequest(Exception exception) {
        return problem(HttpStatus.BAD_REQUEST, INVALID_PARAMETERS_TITLE, "Request validation failed");
    }

    @ExceptionHandler(AdminProductConflictException.class)
    ResponseEntity<SanitizedProblemDetail> handleAdminConflict(AdminProductConflictException exception) {
        return problem(HttpStatus.CONFLICT, "Product conflict", exception.getMessage());
    }

    @ExceptionHandler(AdminProductNotFoundException.class)
    ResponseEntity<SanitizedProblemDetail> handleAdminNotFound(AdminProductNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "Product not found", exception.getMessage());
    }

    @ExceptionHandler(PaymentConfigurationException.class)
    ResponseEntity<SanitizedProblemDetail> handlePaymentConfiguration(PaymentConfigurationException exception) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "Payment service unavailable", "Payment service is not configured");
    }

    @ExceptionHandler(PaymentGatewayException.class)
    ResponseEntity<SanitizedProblemDetail> handlePaymentGateway(PaymentGatewayException exception) {
        return problem(HttpStatus.BAD_GATEWAY, "Payment gateway unavailable", "Payment provider request failed");
    }

    @ExceptionHandler(PaymentConflictException.class)
    ResponseEntity<SanitizedProblemDetail> handlePaymentConflict(PaymentConflictException exception) {
        return problem(HttpStatus.CONFLICT, "Payment conflict", exception.getMessage());
    }

    @ExceptionHandler(PaymentNotFoundException.class)
    ResponseEntity<SanitizedProblemDetail> handlePaymentNotFound(PaymentNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "Payment not found", exception.getMessage());
    }

    @ExceptionHandler(PromptPayUnavailableException.class)
    ResponseEntity<SanitizedProblemDetail> handlePromptPayUnavailable(PromptPayUnavailableException exception) {
        return problem(HttpStatus.CONFLICT, "PromptPay temporarily unavailable", "PromptPay is unavailable during the scheduled window");
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<SanitizedProblemDetail> handleDataIntegrityConflict(DataIntegrityViolationException exception) {
        return problem(HttpStatus.CONFLICT, "Product conflict", "Product constraint conflict");
    }

    private static ResponseEntity<SanitizedProblemDetail> problem(
            HttpStatus status,
            String title,
            String detail) {
        SanitizedProblemDetail problem = new SanitizedProblemDetail(
                ABOUT_BLANK,
                title,
                status.value(),
                detail);

        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem);
    }

    private record SanitizedProblemDetail(URI type, String title, int status, String detail) {
    }
}
