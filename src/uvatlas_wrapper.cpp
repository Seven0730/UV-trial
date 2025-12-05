#include "uvatlas_wrapper.h"
#include <iostream>

// UVAtlas 是 Windows DirectX 库，需要特定的平台支持
// 这里提供一个跨平台的桩实现

namespace UVUnwrapping {

class UVAtlasWrapper::Impl {
public:
    // 占位实现
};

UVAtlasWrapper::UVAtlasWrapper() : impl_(new Impl()) {
}

UVAtlasWrapper::~UVAtlasWrapper() {
    delete impl_;
}

std::pair<Eigen::MatrixXd, std::vector<UVIsland>> UVAtlasWrapper::generate(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const Options& options
) {
#ifdef _WIN32
    // Windows 平台的实现
    // 需要链接 UVAtlas.lib
    
    // TODO: 实现 Windows 版本的 UVAtlas 调用
    // 参考: https://github.com/Microsoft/UVAtlas
    
    std::cerr << "UVAtlas: Windows implementation not yet available" << std::endl;
    return {Eigen::MatrixXd(), {}};
#else
    std::cerr << "UVAtlas: Only available on Windows platform" << std::endl;
    return {Eigen::MatrixXd(), {}};
#endif
}

std::pair<Eigen::MatrixXd, std::vector<UVIsland>> UVAtlasWrapper::generateWithIMT(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const std::vector<Eigen::Matrix3d>& IMT,
    const Options& options
) {
#ifdef _WIN32
    std::cerr << "UVAtlas: Windows implementation not yet available" << std::endl;
    return {Eigen::MatrixXd(), {}};
#else
    std::cerr << "UVAtlas: Only available on Windows platform" << std::endl;
    return {Eigen::MatrixXd(), {}};
#endif
}

std::pair<double, double> UVAtlasWrapper::computeStretch(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const Eigen::MatrixXd& UV
) {
    // 基本的拉伸计算（不依赖 UVAtlas）
    double l2_stretch = 0.0;
    double linf_stretch = 0.0;
    
    for (int i = 0; i < F.rows(); ++i) {
        Eigen::Vector3d v0_3d = V.row(F(i, 0));
        Eigen::Vector3d v1_3d = V.row(F(i, 1));
        Eigen::Vector3d v2_3d = V.row(F(i, 2));
        
        Eigen::Vector2d v0_uv = UV.row(F(i, 0));
        Eigen::Vector2d v1_uv = UV.row(F(i, 1));
        Eigen::Vector2d v2_uv = UV.row(F(i, 2));
        
        Eigen::Vector3d e1_3d = v1_3d - v0_3d;
        Eigen::Vector3d e2_3d = v2_3d - v0_3d;
        
        Eigen::Vector2d e1_uv = v1_uv - v0_uv;
        Eigen::Vector2d e2_uv = v2_uv - v0_uv;
        
        double len1_3d = e1_3d.norm();
        double len2_3d = e2_3d.norm();
        double len1_uv = e1_uv.norm();
        double len2_uv = e2_uv.norm();
        
        if (len1_3d > 1e-10 && len2_3d > 1e-10) {
            double s1 = len1_uv / len1_3d;
            double s2 = len2_uv / len2_3d;
            
            l2_stretch += (s1 * s1 + s2 * s2);
            linf_stretch = std::max(linf_stretch, std::max(s1, s2));
        }
    }
    
    l2_stretch = std::sqrt(l2_stretch / F.rows());
    
    return {l2_stretch, linf_stretch};
}

} // namespace UVUnwrapping
