# Heat Method Geodesic Library
set(GEODESIC_SOURCES
    heat_geodesic.cpp
)

add_library(uv_geodesic STATIC ${GEODESIC_SOURCES})

target_include_directories(uv_geodesic PUBLIC
    ${CMAKE_SOURCE_DIR}/include
)

# Link libigl for mesh processing utilities
target_link_libraries(uv_geodesic PUBLIC igl::core)

# Set C++17
target_compile_features(uv_geodesic PUBLIC cxx_std_17)
